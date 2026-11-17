(() => {
const ACTIONS = {
    GET_ALBUM_TRACKS: 'getAlbumTracksFromSpotify',
    GET_USER_AUTH_STATUS: 'getUserAuthStatus',
    INITIATE_USER_LOGIN: 'initiateUserLogin',
    USER_LOGOUT: 'userLogout',
    GET_SPOTIFY_SETUP: 'getSpotifySetup',
    SAVE_SPOTIFY_SETUP: 'saveSpotifySetup',
    OPEN_SPOTIFY_SETUP: 'openSpotifySetup',
    EXTRACT_IDS: 'extractSpotifyAlbumIds',
    EXTRACT_LINKS: 'extractSpotifyLinks',
    GET_CHART: 'getChart',
    CREATE_PLAYLIST: 'createPlaylist',
};

Object.assign(globalThis.RymSpotify ??= {}, { ACTIONS });
})();
