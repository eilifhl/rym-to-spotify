import { ACTIONS } from "./actions.js";
import { albumTracks, createPlaylist, SpotifyError } from "./spotify.js";
const CONFIG = {
    CLIENT_ID: "06abd10679dd467aaf47a5833ffb327b",
    AUTH_URL: "https://accounts.spotify.com/authorize",
    TOKEN_URL: "https://accounts.spotify.com/api/token",
    REDIRECT_PATH: "oauth2/spotify",
};
const STORAGE_KEYS = {
    ACCESS: "user_spotify_access_token",
    REFRESH: "user_spotify_refresh_token",
    EXPIRY: "user_token_expiry_time",
    SCOPE: "user_spotify_scope",
};
let loginPending = false;
async function clearTokens() {
    await browser.storage.local.remove(Object.values(STORAGE_KEYS));
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
    const data = await browser.storage.local.get([
        STORAGE_KEYS.ACCESS,
        STORAGE_KEYS.REFRESH,
        STORAGE_KEYS.EXPIRY,
    ]);
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
    const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshTokenStr,
        client_id: CONFIG.CLIENT_ID,
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
        await clearTokens();
        return null;
    }
}
// --- Auth Flow ---
async function initiateLogin() {
    if (loginPending)
        return { error: "Spotify login is already open." };
    loginPending = true;
    try {
        const currentCodeVerifier = generateRandomString(64);
        const state = generateRandomString(32);
        const challenge = await generateCodeChallenge(currentCodeVerifier);
        const redirectUri = browser.identity.getRedirectURL(CONFIG.REDIRECT_PATH);
        const params = new URLSearchParams({
            client_id: CONFIG.CLIENT_ID,
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
        return await handleRedirect(responseUrl, redirectUri, currentCodeVerifier, state);
    }
    catch (e) {
        return { error: e.message };
    }
    finally {
        loginPending = false;
    }
}
async function handleRedirect(responseUrl, redirectUri, currentCodeVerifier, state) {
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
        client_id: CONFIG.CLIENT_ID,
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
    const token = await getStoredToken();
    if (!token)
        return { error: "Login required", needsLogin: true, tracks: [] };
    try {
        return { tracks: await albumTracks(token, albumId) };
    }
    catch (e) {
        const needsLogin = e instanceof SpotifyError && e.status === 401;
        if (needsLogin)
            await clearTokens();
        return { error: e instanceof Error ? e.message : "Could not load tracks.", tracks: [], needsLogin };
    }
}
// --- Message Handler ---
browser.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    const handle = async () => {
        switch (req.action) {
            case ACTIONS.GET_ALBUM_TRACKS:
                return await getAlbumTracks(req.albumId);
            case ACTIONS.INITIATE_USER_LOGIN:
                return await initiateLogin();
            case ACTIONS.USER_LOGOUT:
                await clearTokens();
                return { success: true };
            case ACTIONS.CREATE_PLAYLIST: {
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
                    if (error instanceof SpotifyError && error.status === 401)
                        await clearTokens();
                    throw error;
                }
            }
            case ACTIONS.GET_USER_AUTH_STATUS:
                const token = await getStoredToken();
                const stored = await browser.storage.local.get(STORAGE_KEYS.SCOPE);
                return { isLoggedIn: !!token, canCreatePlaylist: !!token && !!stored[STORAGE_KEYS.SCOPE]?.split(" ").includes("playlist-modify-private") };
            default:
                return { error: "Unknown Action" };
        }
    };
    handle().then(sendResponse).catch((error) => sendResponse({ error: error instanceof Error ? error.message : "Extension request failed." }));
    return true;
});
