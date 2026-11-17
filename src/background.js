(() => {
const { ACTIONS, albumTracks, createPlaylist, SpotifyError } = globalThis.RymSpotify;
const CONFIG = {
    LEGACY_CLIENT_ID: "06abd10679dd467aaf47a5833ffb327b",
    AUTH_URL: "https://accounts.spotify.com/authorize",
    TOKEN_URL: "https://accounts.spotify.com/api/token",
    REDIRECT_PATH: "oauth2/spotify",
};
const CLIENT_ID_KEY = 'spotify_client_id';
const STORAGE_KEYS = {
    ACCESS: "user_spotify_access_token",
    REFRESH: "user_spotify_refresh_token",
    EXPIRY: "user_token_expiry_time",
    SCOPE: "user_spotify_scope",
};
let loginPending = false;
let setupPending = false;
let authRevision = 0;
async function clearTokens() {
    authRevision++;
    await browser.storage.local.remove(Object.values(STORAGE_KEYS));
}
async function getClientId() {
    const stored = await browser.storage.local.get([CLIENT_ID_KEY, STORAGE_KEYS.ACCESS, STORAGE_KEYS.REFRESH]);
    // Preserve existing connections; new installations must use their own app.
    return stored[CLIENT_ID_KEY] || (stored[STORAGE_KEYS.ACCESS] || stored[STORAGE_KEYS.REFRESH] ? CONFIG.LEGACY_CLIENT_ID : '');
}
function getRedirectUri() {
    return browser.identity.getRedirectURL(CONFIG.REDIRECT_PATH);
}
async function saveSetup(value) {
    if (loginPending || setupPending)
        throw new Error('Finish the current Spotify connection before changing the Client ID.');
    const clientId = typeof value === 'string' ? value.trim() : '';
    if (!/^[a-fA-F0-9]{32}$/.test(clientId))
        throw new Error('Paste the 32-character Client ID from your Spotify app settings, not the Client Secret.');
    setupPending = true;
    try {
        if (clientId !== await getClientId()) await clearTokens();
        await browser.storage.local.set({ [CLIENT_ID_KEY]: clientId });
        return { success: true };
    }
    finally { setupPending = false; }
}
// --- PKCE Helpers ---
function generateRandomString(length) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
// --- Token Management ---
async function getStoredToken() {
    if (setupPending) return null;
    const revision = authRevision;
    const data = await browser.storage.local.get([
        STORAGE_KEYS.ACCESS,
        STORAGE_KEYS.REFRESH,
        STORAGE_KEYS.EXPIRY,
    ]);
    if (revision !== authRevision || setupPending) return null;
    if (!data[STORAGE_KEYS.ACCESS])
        return null;
    if (Date.now() >= (data[STORAGE_KEYS.EXPIRY] || 0)) {
        console.log("BG: Token expired, refreshing...");
        return data[STORAGE_KEYS.REFRESH]
            ? await refreshToken(data[STORAGE_KEYS.REFRESH])
            : null;
    }
    return data[STORAGE_KEYS.ACCESS];
}
async function refreshToken(refreshTokenStr) {
    const revision = authRevision;
    const clientId = await getClientId();
    if (revision !== authRevision || setupPending) return null;
    const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshTokenStr,
        client_id: clientId,
    });
    try {
        const res = await fetch(CONFIG.TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
        });
        if (!res.ok)
            throw new Error(await res.text());
        const data = await res.json();
        if (revision !== authRevision) return null;
        await browser.storage.local.set({
            [STORAGE_KEYS.ACCESS]: data.access_token,
            [STORAGE_KEYS.REFRESH]: data.refresh_token || refreshTokenStr,
            ...(data.scope !== undefined ? { [STORAGE_KEYS.SCOPE]: data.scope } : {}),
            [STORAGE_KEYS.EXPIRY]: Date.now() + data.expires_in * 1000 - 60000,
        });
        return data.access_token;
    }
    catch (e) {
        console.error("BG: Refresh failed", e);
        if (revision === authRevision) await clearTokens();
        return null;
    }
}
// --- Auth Flow ---
async function initiateLogin() {
    if (loginPending || setupPending)
        return { error: "Spotify login is already open." };
    loginPending = true;
    const revision = authRevision;
    try {
        const clientId = await getClientId();
        if (!clientId) return { error: 'Open Spotify setup and save your Spotify Client ID first.', needsSetup: true };
        const currentCodeVerifier = generateRandomString(64);
        const state = generateRandomString(32);
        const challenge = await generateCodeChallenge(currentCodeVerifier);
        const redirectUri = getRedirectUri();
        const params = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            scope: "playlist-modify-private",
            state,
            redirect_uri: redirectUri,
            code_challenge_method: "S256",
            code_challenge: challenge,
        });
        const responseUrl = await browser.identity.launchWebAuthFlow({
            interactive: true,
            url: `${CONFIG.AUTH_URL}?${params.toString()}`,
        });
        return await handleRedirect(responseUrl, redirectUri, currentCodeVerifier, state, clientId, revision);
    }
    catch (e) {
        return { error: e.message };
    }
    finally {
        loginPending = false;
    }
}
async function handleRedirect(responseUrl, redirectUri, currentCodeVerifier, state, clientId, revision) {
    const url = new URL(responseUrl);
    if (url.origin !== new URL(redirectUri).origin || url.pathname !== new URL(redirectUri).pathname || url.searchParams.get("state") !== state) {
        return { error: "Spotify login verification failed. Please try again." };
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error || !code || !currentCodeVerifier) {
        return { error: error || "No code received" };
    }
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: currentCodeVerifier,
    });
    try {
        const res = await fetch(CONFIG.TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
        });
        if (!res.ok)
            throw new Error(await res.text());
        const data = await res.json();
        if (revision !== authRevision) return { error: 'Spotify connection was cancelled. Connect again when ready.' };
        await browser.storage.local.set({
            [STORAGE_KEYS.ACCESS]: data.access_token,
            [STORAGE_KEYS.REFRESH]: data.refresh_token,
            ...(data.scope !== undefined ? { [STORAGE_KEYS.SCOPE]: data.scope } : {}),
            [STORAGE_KEYS.EXPIRY]: Date.now() + data.expires_in * 1000 - 60000,
        });
        return { success: true };
    }
    catch (e) {
        return { error: e.message };
    }
}
// --- API Actions ---
async function getAlbumTracks(albumId) {
    const revision = authRevision;
    const token = await getStoredToken();
    if (!token)
        return { error: "Login required", needsLogin: true, tracks: [] };
    try {
        return { tracks: await albumTracks(token, albumId) };
    }
    catch (e) {
        const needsLogin = e instanceof SpotifyError && e.status === 401;
        if (needsLogin && revision === authRevision)
            await clearTokens();
        return { error: e instanceof Error ? e.message : "Could not load tracks.", tracks: [], needsLogin };
    }
}
// --- Message Handler ---
browser.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    const handle = async () => {
        switch (req.action) {
            case ACTIONS.GET_SPOTIFY_SETUP: {
                const stored = await browser.storage.local.get(CLIENT_ID_KEY);
                return { clientId: stored[CLIENT_ID_KEY] || '', redirectUri: getRedirectUri(), legacyConnection: !stored[CLIENT_ID_KEY] && !!await getClientId() };
            }
            case ACTIONS.SAVE_SPOTIFY_SETUP:
                return await saveSetup(req.clientId);
            case ACTIONS.OPEN_SPOTIFY_SETUP:
                await browser.runtime.openOptionsPage();
                return { success: true };
            case ACTIONS.GET_ALBUM_TRACKS:
                return await getAlbumTracks(req.albumId);
            case ACTIONS.INITIATE_USER_LOGIN:
                return await initiateLogin();
            case ACTIONS.USER_LOGOUT:
                await clearTokens();
                return { success: true };
            case ACTIONS.CREATE_PLAYLIST: {
                const revision = authRevision;
                const token = await getStoredToken();
                if (!token)
                    return { error: "Connect Spotify first." };
                const stored = await browser.storage.local.get(STORAGE_KEYS.SCOPE);
                if (!stored[STORAGE_KEYS.SCOPE]?.split(" ").includes("playlist-modify-private")) {
                    return { error: "Reconnect Spotify to enable playlist creation." };
                }
                try {
                    return await createPlaylist(token, req.name, req.tracks, req.sourceUrl);
                }
                catch (error) {
                    if (error instanceof SpotifyError && error.status === 401 && revision === authRevision)
                        await clearTokens();
                    throw error;
                }
            }
            case ACTIONS.GET_USER_AUTH_STATUS:
                const token = await getStoredToken();
                const stored = await browser.storage.local.get(STORAGE_KEYS.SCOPE);
                return { isLoggedIn: !!token, canCreatePlaylist: !!token && !!stored[STORAGE_KEYS.SCOPE]?.split(" ").includes("playlist-modify-private"), hasClientId: !!await getClientId() };
            default:
                return { error: "Unknown Action" };
        }
    };
    handle().then(sendResponse).catch((error) => sendResponse({ error: error instanceof Error ? error.message : "Extension request failed." }));
    return true;
});
})();
