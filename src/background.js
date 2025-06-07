const USER_CLIENT_ID = '06abd10679dd467aaf47a5833ffb327b'; // Your existing public Client ID

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

// Action constants for messaging
const ACTION_GET_ALBUM_TRACKS = "getAlbumTracksFromSpotify";
const ACTION_GET_USER_AUTH_STATUS = "getUserAuthStatus"; // Renamed
const ACTION_INITIATE_USER_LOGIN = "initiateUserLogin";
const ACTION_USER_LOGOUT = "userLogout";

// Storage keys for user tokens
const USER_TOKEN_KEY = 'user_spotify_access_token';
const USER_REFRESH_TOKEN_KEY = 'user_spotify_refresh_token';
const USER_TOKEN_EXPIRY_KEY = 'user_token_expiry_time';

let currentCodeVerifier = null;

// --- PKCE Helper Functions ---
function dec2hex(dec) {
    return ('0' + dec.toString(16)).slice(-2);
}

function generateRandomString(len) {
    let arr = new Uint8Array((len || 40) / 2);
    crypto.getRandomValues(arr);
    return Array.from(arr, dec2hex).join('');
}

async function generateCodeChallenge(code_verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(code_verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    // Base64 URL encode
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// --- Authentication Logic ---
async function initiateUserLogin() {
    currentCodeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(currentCodeVerifier);

    const redirectUri = browser.identity.getRedirectURL("oauth2/spotify"); 
    console.log("BG: Using redirect URI for login:", redirectUri);

    const scopes = '';

    let authUrl = `${SPOTIFY_AUTH_URL}?client_id=${USER_CLIENT_ID}`;
    authUrl += `&response_type=code`;
    authUrl += `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    authUrl += `&code_challenge_method=S256`;
    authUrl += `&code_challenge=${codeChallenge}`;
    if (scopes) {
        authUrl += `&scope=${encodeURIComponent(scopes)}`;
    }

    console.log("BG: Initiating login. Auth URL:", authUrl.substring(0,150) + "...");

    try {
        const responseUrlString = await browser.identity.launchWebAuthFlow({
            interactive: true,
            url: authUrl
        });
        return await handleOAuthRedirect(responseUrlString);
    } catch (error) {
        console.error("BG: OAuth login flow error:", error);
        currentCodeVerifier = null; // Clear verifier on error
        return { error: `Login failed: ${error.message || String(error)}` };
    }
}

async function handleOAuthRedirect(redirectUrlString) {
    if (!redirectUrlString) {
        currentCodeVerifier = null;
        return { error: "Authorization failed or was cancelled by the user." };
    }
    console.log("BG: Received OAuth redirect URL.");
    const url = new URL(redirectUrlString);
    const authCode = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        currentCodeVerifier = null;
        return { error: `Spotify authorization error: ${error}` };
    }
    if (!authCode) {
        currentCodeVerifier = null;
        return { error: "No authorization code received from Spotify." };
    }
    if (!currentCodeVerifier) {
        return { error: "Internal error: Code verifier missing post-redirect." };
    }

    const redirectUri = browser.identity.getRedirectURL("oauth2/spotify");

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', authCode);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', USER_CLIENT_ID);
    params.append('code_verifier', currentCodeVerifier);

    currentCodeVerifier = null; // Verifier is used, clear it for security.

    try {
        const tokenResponse = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({ error_description: "Unknown token exchange error" }));
            console.error("BG: Spotify Token Exchange Error:", tokenResponse.status, errorData);
            throw new Error(`Token exchange failed: ${errorData.error_description || tokenResponse.statusText}`);
        }

        const tokenData = await tokenResponse.json();
        await browser.storage.local.set({
            [USER_TOKEN_KEY]: tokenData.access_token,
            [USER_REFRESH_TOKEN_KEY]: tokenData.refresh_token,
            [USER_TOKEN_EXPIRY_KEY]: Date.now() + (tokenData.expires_in * 1000) - 60000
        });
        console.log("BG: User access token obtained and stored.");
        return { success: true, message: "Successfully logged in!" };
    } catch (e) {
        console.error("BG: Error exchanging code for token:", e);
        return { error: e.message };
    }
}

async function getUserAccessToken() {
    let stored = await browser.storage.local.get([USER_TOKEN_KEY, USER_REFRESH_TOKEN_KEY, USER_TOKEN_EXPIRY_KEY]);

    if (!stored[USER_TOKEN_KEY]) {
        return null; // User not logged in or tokens cleared
    }

    if (Date.now() >= stored[USER_TOKEN_EXPIRY_KEY]) {
        console.log("BG: User access token expired, attempting refresh.");
        if (!stored[USER_REFRESH_TOKEN_KEY]) {
            console.error("BG: Access token expired, but no refresh token available. User needs to log in again.");
            await clearUserTokens(); // Clear out stale/invalid tokens
            return null;
        }
        return await refreshUserAccessToken(stored[USER_REFRESH_TOKEN_KEY]);
    }

    console.log("BG: Using valid stored user access token.");
    return stored[USER_TOKEN_KEY];
}

async function refreshUserAccessToken(refreshToken) {
    console.log("BG: Refreshing user access token...");
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', USER_CLIENT_ID);

    try {
        const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error_description: "Unknown token refresh error" }));
            console.error('BG: Spotify Token Refresh Error:', response.status, errorData);
            if (response.status === 400 && (errorData.error === 'invalid_grant' || errorData.error === 'invalid_request')) {
                console.warn("BG: Refresh token invalid or expired. Clearing user tokens. User needs to log in again.");
                await clearUserTokens();
                return null;
            }
            throw new Error(`Token refresh failed: ${errorData.error_description || response.statusText}`);
        }

        const data = await response.json();
        const newAccessToken = data.access_token;
        // Spotify might return a new refresh token, use it if provided
        const newRefreshToken = data.refresh_token || refreshToken;
        const newExpiryTime = Date.now() + (data.expires_in * 1000) - 60000; // 60s buffer

        await browser.storage.local.set({
            [USER_TOKEN_KEY]: newAccessToken,
            [USER_REFRESH_TOKEN_KEY]: newRefreshToken,
            [USER_TOKEN_EXPIRY_KEY]: newExpiryTime
        });
        console.log("BG: User access token refreshed and stored.");
        return newAccessToken;
    } catch (error) {
        console.error('BG: Failed to refresh user access token:', error);
        return null;
    }
}

async function clearUserTokens() {
    await browser.storage.local.remove([USER_TOKEN_KEY, USER_REFRESH_TOKEN_KEY, USER_TOKEN_EXPIRY_KEY]);
    console.log("BG: User tokens cleared from storage.");
}

async function handleUserLogout() {
    await clearUserTokens();
    return { success: true, message: "Logged out successfully." };
}

async function handleGetUserAuthStatus() {
    const token = await getUserAccessToken();
    return { isLoggedIn: !!token };
}

/**
 * Fetches track URLs for a given Spotify album ID using the user's token.
 * @param {string} albumId - The Spotify album ID.
 * @param {string} userAccessToken - The Spotify user access token.
 * @returns {Promise<object>} An object with a `tracks` array or an `error` message.
 */
async function getAlbumTracks(albumId, userAccessToken) {
    if (!userAccessToken) {
        return { error: "Missing Spotify user access token for getAlbumTracks." , needsLogin: true};
    }
    const market = (navigator.language && navigator.language.split('-')[1]) || 'US';
    const url = `${SPOTIFY_API_BASE_URL}/albums/${albumId}/tracks?market=${market}&limit=50`;

    console.log(`BG: Fetching tracks for album ID: ${albumId} using user token.`);
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: "Unknown API error, response not JSON" } }));
            console.error(`BG: Spotify API Error (getAlbumTracks for ${albumId}):`, response.status, errorData);
            if (response.status === 401) { // Unauthorized - token might be invalid despite checks
                console.warn("BG: Got 401 fetching tracks. Token might be bad. Clearing tokens.");
                await clearUserTokens();
                return { error: `API Authorization Error: ${errorData.error?.message || response.statusText}. Please log in again.`, tracks: [], needsLogin: true };
            }
            return { error: `API Error: ${errorData.error?.message || response.statusText}`, tracks: [] };
        }

        const data = await response.json();
        const trackUrls = data.items
            .map(track => track.external_urls?.spotify)
            .filter(Boolean);

        console.log(`BG: Found ${trackUrls.length} tracks for album ${albumId}.`);
        return { tracks: trackUrls };
    } catch (error) {
        console.error(`BG: Network/other error fetching tracks for album ${albumId}:`, error);
        return { error: error.message, tracks: [] };
    }
}

// --- Message Handler Functions ---

async function handleGetAlbumTracksFromSpotify(request) {
    if (!request.albumId) {
        return { error: "Album ID missing in request." };
    }

    const userToken = await getUserAccessToken(); 
    if (!userToken) {
        return { error: "User not logged in or Spotify token unavailable. Please log in.", needsLogin: true };
    }

    return getAlbumTracks(request.albumId, userToken);
}

// --- Main Message Listener ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {

    let promiseHandler;

    switch (request.action) {
        case ACTION_GET_ALBUM_TRACKS:
            promiseHandler = handleGetAlbumTracksFromSpotify(request);
            break;
        case ACTION_GET_USER_AUTH_STATUS:
            promiseHandler = handleGetUserAuthStatus();
            break;
        case ACTION_INITIATE_USER_LOGIN:
            promiseHandler = initiateUserLogin();
            break;
        case ACTION_USER_LOGOUT:
            promiseHandler = handleUserLogout();
            break;
        default:
            console.warn("BG: No matching action for message:", request.action);
            sendResponse({ error: `Unknown action: ${request.action}` });
            return false; 
    }

    promiseHandler
        .then(response => {
            sendResponse(response);
        })
        .catch(error => {
            console.error(`BG: Error processing action ${request.action}:`, error);
            sendResponse({ error: error.message || "An internal error occurred in background script." });
        });

    return true; 
});

// --- Initialization ---
async function checkInitialUserStatus() {
    const status = await handleGetUserAuthStatus();
    console.log("BG: Initial user auth status:", status);
}
checkInitialUserStatus();
