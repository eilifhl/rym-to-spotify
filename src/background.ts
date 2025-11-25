// src/background.ts
import { Runtime } from "webextension-polyfill"; // Import types
import { ACTIONS, MessageRequest, TrackResponse } from "./types";

// Configuration
const CONFIG = {
  CLIENT_ID: "06abd10679dd467aaf47a5833ffb327b",
  AUTH_URL: "https://accounts.spotify.com/authorize",
  TOKEN_URL: "https://accounts.spotify.com/api/token",
  API_BASE: "https://api.spotify.com/v1",
  REDIRECT_PATH: "oauth2/spotify",
};

const STORAGE_KEYS = {
  ACCESS: "user_spotify_access_token",
  REFRESH: "user_spotify_refresh_token",
  EXPIRY: "user_token_expiry_time",
};

let currentCodeVerifier: string | null = null;

// --- PKCE Helpers ---
function generateRandomString(length: number): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// --- Token Management ---
async function getStoredToken(): Promise<string | null> {
  const data = await browser.storage.local.get([
    STORAGE_KEYS.ACCESS,
    STORAGE_KEYS.REFRESH,
    STORAGE_KEYS.EXPIRY,
  ]);

  if (!data[STORAGE_KEYS.ACCESS]) return null;

  if (Date.now() >= (data[STORAGE_KEYS.EXPIRY] || 0)) {
    console.log("BG: Token expired, refreshing...");
    return data[STORAGE_KEYS.REFRESH]
      ? await refreshToken(data[STORAGE_KEYS.REFRESH])
      : null;
  }

  return data[STORAGE_KEYS.ACCESS];
}

async function refreshToken(refreshTokenStr: string): Promise<string | null> {
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

    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    await browser.storage.local.set({
      [STORAGE_KEYS.ACCESS]: data.access_token,
      [STORAGE_KEYS.REFRESH]: data.refresh_token || refreshTokenStr,
      [STORAGE_KEYS.EXPIRY]: Date.now() + data.expires_in * 1000 - 60000,
    });

    return data.access_token;
  } catch (e) {
    console.error("BG: Refresh failed", e);
    await browser.storage.local.clear();
    return null;
  }
}

// --- Auth Flow ---
async function initiateLogin(): Promise<{ success?: boolean; error?: string }> {
  try {
    currentCodeVerifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(currentCodeVerifier);
    const redirectUri = browser.identity.getRedirectURL(CONFIG.REDIRECT_PATH);

    const params = new URLSearchParams({
      client_id: CONFIG.CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });

    const responseUrl = await browser.identity.launchWebAuthFlow({
      interactive: true,
      url: `${CONFIG.AUTH_URL}?${params.toString()}`,
    });

    return await handleRedirect(responseUrl, redirectUri);
  } catch (e: any) {
    return { error: e.message };
  }
}

async function handleRedirect(responseUrl: string, redirectUri: string) {
  const url = new URL(responseUrl);
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

  currentCodeVerifier = null; // Cleanup

  try {
    const res = await fetch(CONFIG.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    await browser.storage.local.set({
      [STORAGE_KEYS.ACCESS]: data.access_token,
      [STORAGE_KEYS.REFRESH]: data.refresh_token,
      [STORAGE_KEYS.EXPIRY]: Date.now() + data.expires_in * 1000 - 60000,
    });

    return { success: true };
  } catch (e: any) {
    return { error: e.message };
  }
}

// --- API Actions ---
async function getAlbumTracks(albumId: string): Promise<TrackResponse> {
  const token = await getStoredToken();
  if (!token) return { error: "Login required", needsLogin: true, tracks: [] };

  try {
    // Determine market based on browser language or default to US
    const market = navigator.language?.split("-")[1] || "US";
    const res = await fetch(
      `${CONFIG.API_BASE}/albums/${albumId}/tracks?limit=50&market=${market}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.status === 401) {
      await browser.storage.local.clear();
      return { error: "Session expired", needsLogin: true, tracks: [] };
    }
    if (!res.ok) throw new Error(res.statusText);

    const data = await res.json();
    const urls = data.items
      .map((t: any) => t.external_urls?.spotify)
      .filter(Boolean);
    return { tracks: urls };
  } catch (e: any) {
    return { error: e.message, tracks: [] };
  }
}

// --- Message Handler ---
browser.runtime.onMessage.addListener(
  (
    req: MessageRequest,
    _sender: Runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => {
    const handle = async () => {
      switch (req.action) {
        case ACTIONS.GET_ALBUM_TRACKS:
          return await getAlbumTracks(req.albumId);
        case ACTIONS.INITIATE_USER_LOGIN:
          return await initiateLogin();
        case ACTIONS.USER_LOGOUT:
          await browser.storage.local.clear();
          return { success: true };
        case ACTIONS.GET_USER_AUTH_STATUS:
          const token = await getStoredToken();
          return { isLoggedIn: !!token };
        default:
          return { error: "Unknown Action" };
      }
    };

    handle().then(sendResponse);
    return true; // Async response
  },
);
