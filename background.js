const CLIENT_ID = '06abd10679dd467aaf47a5833ffb327b';
const CLIENT_SECRET = 'b9a81533d0234438be9a82b4fe93774e';
let spotifyAccessToken = null;
let tokenExpiryTime = 0;

async function getAppAccessToken() {
    if (spotifyAccessToken && Date.now() < tokenExpiryTime) {
        console.log("BG: Using existing app access token");
        return spotifyAccessToken;
    }

    console.log("BG: Requesting new app access token from Spotify...");

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(CLIENT_ID + ':' + CLIENT_SECRET)
            },
            body: params
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('BG: Spotify App Token Error:', response.status, errorData);
            throw new Error(`Spotify App Token Error: ${response.status} ${errorData.error_description || errorData.error}`);
        }

        const data = await response.json();
        spotifyAccessToken = data.access_token;
        tokenExpiryTime = Date.now() + (data.expires_in * 1000) - 60000; // Store with 1 min buffer
        console.log("BG: New app access token obtained, expires in:", data.expires_in, "seconds");
        await browser.storage.local.set({ app_spotify_access_token: spotifyAccessToken, app_token_expiry_time: tokenExpiryTime });
        return spotifyAccessToken;
    } catch (error) {
        console.error('BG: Failed to fetch app access token:', error);
        spotifyAccessToken = null;
        tokenExpiryTime = 0;
        return null;
    }
}

async function getAlbumTracks(albumId, token) {
    if (!token) {
        console.error("BG: No access token provided for getAlbumTracks for album:", albumId);
        return { error: "Missing Spotify access token." };
    }
    const market = 'US';
    const url = `https://api.spotify.com/v1/albums/${albumId}/tracks?market=${market}&limit=50`;

    console.log(`BG: Fetching tracks for album ID: ${albumId}`);
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`BG: Spotify API Error for album ${albumId}:`, response.status, errorData);
            return { error: `API Error: ${errorData.error?.message || response.statusText}`, tracks: [] };
        }
        const data = await response.json();
        const trackUrls = data.items.map(track => track.external_urls.spotify).filter(url => url); // Filter out any undefined URLs
        console.log(`BG: Found ${trackUrls.length} tracks for album ${albumId}`);
        return { tracks: trackUrls };
    } catch (error) {
        console.error(`BG: Error fetching tracks for album ${albumId}:`, error);
        return { error: error.message, tracks: [] };
    }
}

// --- Single Message Listener for Background Script ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("BG: Received message:", request.action, request);

    if (request.action === "initiateSpotifyLogin") {
        console.warn("BG: User-specific login (initiateSpotifyLogin) is a placeholder.");
        sendResponse({ note: "User login flow placeholder." });
        return false;

    } else if (request.action === "getAlbumTracksFromSpotify") {
        if (!request.albumId) {
            console.error("BG: Album ID missing for getAlbumTracksFromSpotify");
            sendResponse({ error: "Album ID missing" });
            return false;
        }
        
        (async () => {
            try {
                console.log("BG: Getting app token for tracks request...");
                const appToken = await getAppAccessToken();
                if (!appToken) {
                    console.error("BG: Could not get Spotify app access token for tracks.");
                    sendResponse({ error: "Could not get Spotify app access token." });
                    return;
                }
                const result = await getAlbumTracks(request.albumId, appToken);
                console.log(`BG: Preparing to send result for album ${request.albumId}:`, JSON.stringify(result, null, 2));
                sendResponse(result);
            } catch (e) {
                console.error("BG: Error in getAlbumTracksFromSpotify async IIFE:", e);
                sendResponse({ error: "Internal background error processing tracks."});
            }
        })();
        return true;

    } else if (request.action === "getAppTokenStatus") {
        (async () => { // IIFE for async
            try {
                const token = await getAppAccessToken();
                sendResponse({ hasToken: !!token });
            } catch (e) {
                console.error("BG: Error in getAppTokenStatus async IIFE:", e);
                sendResponse({ error: "Internal background error getting token status."});
            }
        })();
        return true;
    }
    
    console.warn("BG: No matching action for message:", request.action);
});

(async () => {
    try {
        const stored = await browser.storage.local.get(['app_spotify_access_token', 'app_token_expiry_time']);
        if (stored.app_spotify_access_token && stored.app_token_expiry_time && Date.now() < stored.app_token_expiry_time) {
            spotifyAccessToken = stored.app_spotify_access_token;
            tokenExpiryTime = stored.app_token_expiry_time;
            console.log("BG: Loaded stored app access token from startup.");
        } else {
            console.log("BG: No valid stored app access token found on startup, will fetch when needed.");
        }
    } catch (e) {
        console.error("BG: Error loading stored token on startup:", e);
    }
})();
