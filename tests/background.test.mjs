import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const clientA = 'a'.repeat(32), clientB = 'b'.repeat(32);
const redirect = 'https://example.extensions.allizom.org/';
const token = 'user_spotify_access_token', refresh = 'user_spotify_refresh_token';
const expiry = 'user_token_expiry_time', scope = 'user_spotify_scope';
const json = data => new Response(JSON.stringify(data));
function fixture(initial = {}) {
    const stored = { ...initial }, requests = [], logins = [];
    let listener, opened = false;
    const browser = {
        storage: { local: {
            async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, stored[key]])); },
            async set(values) { Object.assign(stored, values); },
            async remove(keys) { for (const key of keys) delete stored[key]; },
        } },
        runtime: { onMessage: { addListener(fn) { listener = fn; } }, async openOptionsPage() { opened = true; } },
        identity: {
            getRedirectURL() { return redirect; },
            async launchWebAuthFlow({ url }) {
                const params = new URL(url).searchParams;
                logins.push(params);
                return `${redirect}?code=code&state=${params.get('state')}`;
            },
        },
    };
    const context = vm.createContext({ browser, URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto, btoa, console,
        fetch: async (url, init) => { requests.push({ url, params: init.body }); return json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: 'playlist-modify-private' }); },
    });
    vm.runInContext(readFileSync('src/actions.js', 'utf8'), context);
    context.RymSpotify.albumTracks = async () => ['https://open.spotify.com/track/example'];
    context.RymSpotify.createPlaylist = async () => ({ success: true });
    vm.runInContext(readFileSync('src/background.js', 'utf8'), context);
    const send = (action, values = {}) => new Promise(resolve => listener({ action, ...values }, {}, resolve));
    return { stored, requests, logins, browser, context, send, opened: () => opened };
}

test('new users get the exact redirect URL and must configure their own app', async () => {
    const f = fixture();
    const setup = await f.send('getSpotifySetup');
    assert.equal(setup.clientId, '');
    assert.equal(setup.redirectUri, redirect);
    assert.equal((await f.send('getUserAuthStatus')).hasClientId, false);
    assert.equal((await f.send('initiateUserLogin')).needsSetup, true);
    assert.equal(f.logins.length, 0);
    await f.send('openSpotifySetup');
    assert.equal(f.opened(), true);
});

test('invalid Client IDs do not change settings or discard a working connection', async () => {
    const f = fixture({ spotify_client_id: clientA, [token]: 'existing' });
    assert.match((await f.send('saveSpotifySetup', { clientId: 'bad' })).error, /32-character/);
    assert.equal(f.stored.spotify_client_id, clientA);
    assert.equal(f.stored[token], 'existing');
});

test('PKCE login and token exchange use the saved Client ID and displayed redirect URL', async () => {
    const f = fixture();
    assert.equal((await f.send('saveSpotifySetup', { clientId: ` ${clientA} ` })).success, true);
    assert.equal((await f.send('initiateUserLogin')).success, true);
    assert.equal(f.logins[0].get('client_id'), clientA);
    assert.equal(f.logins[0].get('redirect_uri'), (await f.send('getSpotifySetup')).redirectUri);
    assert.equal(f.logins[0].get('code_challenge_method'), 'S256');
    assert.equal(f.logins[0].get('scope'), 'playlist-modify-private');
    assert.equal(f.requests[0].params.get('client_id'), clientA);
    assert.equal(f.requests[0].params.get('redirect_uri'), redirect);
    assert.ok(f.requests[0].params.get('code_verifier'));
    assert.equal(f.requests[0].params.has('client_secret'), false);
    assert.equal((await f.send('getUserAuthStatus')).canCreatePlaylist, true);
});

test('switching apps clears old tokens; disconnecting preserves the chosen app', async () => {
    const f = fixture({ spotify_client_id: clientA, [token]: 'old', [refresh]: 'old-refresh', [expiry]: Date.now() + 100000, [scope]: 'playlist-modify-private' });
    await f.send('saveSpotifySetup', { clientId: clientA });
    assert.equal(f.stored[token], 'old');
    await f.send('saveSpotifySetup', { clientId: clientB });
    for (const key of [token, refresh, expiry, scope]) assert.equal(f.stored[key], undefined);
    assert.equal(f.stored.spotify_client_id, clientB);
    await f.send('initiateUserLogin');
    await f.send('userLogout');
    assert.equal(f.stored.spotify_client_id, clientB);
    assert.equal((await f.send('getUserAuthStatus')).isLoggedIn, false);
});

test('refresh uses the personal Client ID; legacy connections retain their original app', async () => {
    for (const custom of [true, false]) {
        const f = fixture({ ...(custom ? { spotify_client_id: clientA } : {}), [token]: 'expired', [refresh]: 'refresh', [expiry]: 0 });
        assert.equal((await f.send('getSpotifySetup')).legacyConnection, !custom);
        assert.equal((await f.send('getUserAuthStatus')).isLoggedIn, true);
        assert.equal(f.requests[0].params.get('client_id'), custom ? clientA : '06abd10679dd467aaf47a5833ffb327b');
    }
});

test('changing apps cannot restore an old refresh response', async () => {
    const f = fixture({ spotify_client_id: clientA, [token]: 'expired', [refresh]: 'refresh', [expiry]: 0 });
    let release, started;
    const pending = new Promise(resolve => { started = resolve; });
    f.context.fetch = async () => { started(); return new Promise(resolve => { release = resolve; }); };
    const status = f.send('getUserAuthStatus');
    await pending;
    await f.send('saveSpotifySetup', { clientId: clientB });
    release(json({ access_token: 'stale', expires_in: 3600 }));
    assert.equal((await status).isLoggedIn, false);
    assert.equal(f.stored[token], undefined);
    assert.equal(f.stored.spotify_client_id, clientB);
});

test('an app cannot change mid-login and logout prevents late login from restoring tokens', async () => {
    const f = fixture({ spotify_client_id: clientA });
    let release, started;
    const pending = new Promise(resolve => { started = resolve; });
    f.browser.identity.launchWebAuthFlow = async ({ url }) => {
        const params = new URL(url).searchParams;
        started();
        return new Promise(resolve => { release = () => resolve(`${redirect}?code=code&state=${params.get('state')}`); });
    };
    const login = f.send('initiateUserLogin');
    await pending;
    assert.match((await f.send('saveSpotifySetup', { clientId: clientB })).error, /current Spotify connection/);
    await f.send('userLogout');
    release();
    assert.match((await login).error, /cancelled/);
    assert.equal(f.stored[token], undefined);
});
