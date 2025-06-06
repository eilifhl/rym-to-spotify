const CLIENT_ID = '06abd10679dd467aaf47a5833ffb327b';
const CLIENT_SECRET = 'b9a81533d0234438be9a82b4fe93774e';

const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';

// Action constants for messaging
const ACTION_GET_ALBUM_TRACKS = "getAlbumTracksFromSpotify";
const ACTION_GET_APP_TOKEN_STATUS = "getAppTokenStatus";
// const ACTION_INITIATE_SPOTIFY_LOGIN = "initiateSpotifyLogin"; // Example if used

let spotifyAccessToken = null;
let tokenExpiryTime = 0; // Timestamp in milliseconds

/**
 * Loads Spotify access token from local storage on script startup.
 */
async function loadTokenFromStorage() {
    try {
        const stored = await browser.storage.local.get(['app_spotify_access_token', 'app_token_expiry_time']);
        if (stored.app_spotify_access_token && stored.app_token_expiry_time && Date.now() < stored.app_token_expiry_time) {
            spotifyAccessToken = stored.app_spotify_access_token;
            tokenExpiryTime = stored.app_token_expiry_time;
            console.log("BG: Loaded stored app access token.");
        } else {
            console.log("BG: No valid stored app access token, will fetch when needed.");
        }
    } catch (e) {
        console.error("BG: Error loading stored token on startup:", e);
    }
}

/**
 * Fetches or returns a cached Spotify app access token.
 * @returns {Promise<string|null>} The access token or null if an error occurs.
 */
async function getAppAccessToken() {
    if (spotifyAccessToken && Date.now() < tokenExpiryTime) {
        console.log("BG: Using existing valid app access token.");
        return spotifyAccessToken;
    }

    console.log("BG: Requesting new app access token from Spotify...");
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    try {
        const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(CLIENT_ID + ':' + CLIENT_SECRET)
            },
            body: params
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error_description: "Unknown error, response not JSON" }));
            console.error('BG: Spotify App Token API Error:', response.status, errorData);
            throw new Error(`Spotify App Token Error: ${response.status} ${errorData.error_description || errorData.error || "Failed to obtain token"}`);
        }

        const data = await response.json();
        spotifyAccessToken = data.access_token;
        tokenExpiryTime = Date.now() + (data.expires_in * 1000) - 60000; // 60s buffer
        
        await browser.storage.local.set({ 
            app_spotify_access_token: spotifyAccessToken, 
            app_token_expiry_time: tokenExpiryTime 
        });
        console.log(`BG: New app access token obtained. Expires around: ${new Date(tokenExpiryTime).toISOString()}`);
        return spotifyAccessToken;
    } catch (error) {
        console.error('BG: Failed to fetch/process app access token:', error.message);
        spotifyAccessToken = null; // Clear any potentially stale token info
        tokenExpiryTime = 0;
        return null; // Indicate failure to the caller
    }
}

/**
 * Fetches track URLs for a given Spotify album ID.
 * @param {string} albumId - The Spotify album ID.
 * @param {string} token - The Spotify access token.
 * @returns {Promise<object>} An object with a `tracks` array or an `error` message.
 */
async function getAlbumTracks(albumId, token) {
    if (!token) {
        return { error: "Missing Spotify access token for getAlbumTracks." };
    }
    const market = (navigator.language && navigator.language.split('-')[1]) || 'US'; // Dynamically detect user's market or fallback to 'US'
    const url = `${SPOTIFY_API_BASE_URL}/albums/${albumId}/tracks?market=${market}&limit=50`;

    console.log(`BG: Fetching tracks for album ID: ${albumId}`);
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: "Unknown API error, response not JSON" } }));
            console.error(`BG: Spotify API Error (getAlbumTracks for ${albumId}):`, response.status, errorData);
            return { error: `API Error: ${errorData.error?.message || response.statusText}`, tracks: [] };
        }

        const data = await response.json();
        const trackUrls = data.items
            .map(track => track.external_urls?.spotify) // Optional chaining for safety
            .filter(Boolean); // Filter out null/undefined URLs

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
    
    const appToken = await getAppAccessToken();
    if (!appToken) {
        return { error: "Failed to obtain Spotify app access token for track fetching." };
    }
    
    return getAlbumTracks(request.albumId, appToken);
}

async function handleGetAppTokenStatus() {
    const token = await getAppAccessToken(); // This will attempt to fetch if not present/valid
    return { hasToken: !!token }; // Convert token (string or null) to boolean
}

// --- Main Message Listener ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("BG: Received message:", request.action, request.albumId || '');

    let promiseHandler;

    switch (request.action) {
        case ACTION_GET_ALBUM_TRACKS:
            promiseHandler = handleGetAlbumTracksFromSpotify(request);
            break;
        case ACTION_GET_APP_TOKEN_STATUS:
            promiseHandler = handleGetAppTokenStatus();
            break;
        // case ACTION_INITIATE_SPOTIFY_LOGIN:
        //     console.warn("BG: User-specific login (initiateSpotifyLogin) is a placeholder.");
        //     sendResponse({ note: "User login flow placeholder." }); // Synchronous response
        //     return false; // Indicate synchronous response or no response expected via sendResponse
        default:
            console.warn("BG: No matching action for message:", request.action);
            sendResponse({ error: `Unknown action: ${request.action}` });
            return false; 
    }

    // Handle async actions
    promiseHandler
        .then(response => sendResponse(response))
        .catch(error => {
            console.error(`BG: Error processing action ${request.action}:`, error);
            sendResponse({ error: error.message || "An internal error occurred in background script." });
        });
    
    return true; // Crucial: Indicates that sendResponse will be called asynchronously.
});

// --- Initialization ---
loadTokenFromStorage(); // Load token when background script starts
