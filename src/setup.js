(() => {
const { ACTIONS } = globalThis.RymSpotify;
const el = selector => document.querySelector(selector);
const clientId = el('#client-id');
const connect = el('#save-connect');
const test = el('#test-connection');
let busy = false;
let testing = false;
let connected = false;
let savedClientId = '';
const message = (selector, text, error = false) => {
    const target = el(selector);
    target.textContent = text;
    target.dataset.error = String(error);
};
async function send(action, data = {}) {
    const response = await browser.runtime.sendMessage({ action, ...data });
    if (!response || response.error) throw new Error(response?.error || 'Could not reach the extension. Reload this setup page.');
    return response;
}
function update() {
    clientId.disabled = busy;
    connect.disabled = busy;
    connect.textContent = busy && !testing ? 'Connecting…' : 'Save and connect';
    el('#test-album').disabled = busy;
    test.disabled = busy || !connected || clientId.value.trim() !== savedClientId;
    test.textContent = testing ? 'Testing…' : 'Test album access';
}
async function load() {
    try {
        const config = await send(ACTIONS.GET_SPOTIFY_SETUP);
        el('#redirect-uri').value = config.redirectUri;
        el('#copy-redirect').disabled = false;
        clientId.value = savedClientId = config.clientId;
        el('#legacy-notice').hidden = !config.legacyConnection;
        const auth = await send(ACTIONS.GET_USER_AUTH_STATUS);
        connected = auth.isLoggedIn && auth.canCreatePlaylist;
        message('#connection-status', connected ? 'Spotify connected. You can test album access below.' : config.clientId ? 'Client ID saved. Connect Spotify to continue.' : 'Complete steps 1 and 2, then paste your Client ID above.');
        update();
    }
    catch (error) { message('#connection-status', error.message, true); }
}
el('#copy-redirect').onclick = async () => {
    try {
        await navigator.clipboard.writeText(el('#redirect-uri').value);
        message('#copy-status', 'Copied to clipboard');
    }
    catch {
        el('#redirect-uri').focus();
        el('#redirect-uri').select();
        message('#copy-status', 'Select and copy the URL above. Clipboard access was blocked.', true);
    }
};
clientId.oninput = () => {
    el('#ready').hidden = true;
    message('#test-status', '');
    update();
};
el('#setup-form').onsubmit = async event => {
    event.preventDefault();
    if (busy || !el('#setup-form').reportValidity()) return;
    busy = true;
    update();
    el('#ready').hidden = true;
    message('#test-status', '');
    try {
        await send(ACTIONS.SAVE_SPOTIFY_SETUP, { clientId: clientId.value.trim() });
        savedClientId = clientId.value.trim();
        message('#connection-status', 'Client ID saved. Finish signing in in the Spotify window…');
        await send(ACTIONS.INITIATE_USER_LOGIN);
        const auth = await send(ACTIONS.GET_USER_AUTH_STATUS);
        connected = auth.isLoggedIn && auth.canCreatePlaylist;
        if (!connected) throw new Error('Spotify has not granted playlist permission. Select Save and connect to try again.');
        el('#legacy-notice').hidden = true;
        message('#connection-status', 'Spotify connected. Test album access below.');
    }
    catch (error) {
        connected = false;
        message('#connection-status', `${error.message} Your saved Client ID is kept so you can retry.`, true);
    }
    finally { busy = false; update(); }
};
el('#test-album').oninput = () => { el('#ready').hidden = true; message('#test-status', ''); };
test.onclick = async () => {
    if (busy || test.disabled) return;
    const value = el('#test-album').value.trim();
    let albumId = '4aawyAB9vmqN3uQ7FjRGTy';
    if (value) {
        try {
            const url = new URL(value);
            const match = /^\/(?:intl-[a-z-]+\/)?album\/([a-zA-Z0-9]{22})\/?$/.exec(url.pathname);
            if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || !match) throw new Error();
            albumId = match[1];
        }
        catch { message('#test-status', 'Paste a Spotify album link, such as https://open.spotify.com/album/…, or leave it empty for the sample.', true); return; }
    }
    busy = true;
    testing = true;
    update();
    // This is a read-only API test; it never calls playlist creation.
    message('#test-status', 'Fetching tracks from one album…');
    el('#ready').hidden = true;
    try {
        const response = await send(ACTIONS.GET_ALBUM_TRACKS, { albumId });
        if (!response.tracks?.length) throw new Error('This album has no available tracks. Try another Spotify album link.');
        message('#test-status', `Success — fetched ${response.tracks.length} ${response.tracks.length === 1 ? 'track' : 'tracks'} from one album.`);
        el('#ready').hidden = false;
    }
    catch (error) { message('#test-status', error.message, true); }
    finally { busy = false; testing = false; update(); }
};
void load();
})();
