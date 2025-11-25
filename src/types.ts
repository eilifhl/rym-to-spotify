// ==> types.ts <==

export const ACTIONS = {
  GET_ALBUM_TRACKS: "getAlbumTracksFromSpotify",
  GET_USER_AUTH_STATUS: "getUserAuthStatus",
  INITIATE_USER_LOGIN: "initiateUserLogin",
  USER_LOGOUT: "userLogout",
  EXTRACT_IDS: "extractSpotifyAlbumIds",
  EXTRACT_LINKS: "extractSpotifyLinks",
} as const;

// --- Spotify API Interfaces ---

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface SpotifyTrack {
  external_urls: { spotify: string };
  name: string;
  id: string;
}

export interface SpotifyAlbumResponse {
  items: SpotifyTrack[];
}

// --- Message Payloads & Responses ---

export type MessageRequest =
  | { action: typeof ACTIONS.GET_ALBUM_TRACKS; albumId: string }
  | { action: typeof ACTIONS.GET_USER_AUTH_STATUS }
  | { action: typeof ACTIONS.INITIATE_USER_LOGIN }
  | { action: typeof ACTIONS.USER_LOGOUT }
  | { action: typeof ACTIONS.EXTRACT_IDS }
  | { action: typeof ACTIONS.EXTRACT_LINKS };

export interface BaseResponse {
  success?: boolean;
  error?: string;
  message?: string;
}

export interface AuthStatusResponse extends BaseResponse {
  isLoggedIn: boolean;
}

export interface TrackResponse extends BaseResponse {
  tracks: string[]; // Array of URLs
  needsLogin?: boolean;
}

export interface AlbumIdEntry {
  id: string;
  title: string;
}

export interface ExtractIdsResponse extends BaseResponse {
  albums: AlbumIdEntry[];
}

export interface ExtractLinksResponse extends BaseResponse {
  links: string[];
}

// --- RYM Data Structure (Content Script) ---
export interface RymSpotifyData {
  spotify?: {
    [key: string]: {
      type: string;
      default?: boolean;
    };
  };
}
