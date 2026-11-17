let connected = false, configuredId = '', failClipboard = false, failLogin = false, failTracks = false;
const setupCalls = [], setupCopied = [];
window.browser = {
    runtime: { async sendMessage(req) {
        setupCalls.push(req);
        switch (req.action) {
            case 'getSpotifySetup': return { clientId: configuredId, redirectUri: 'https://example.extensions.allizom.org/', legacyConnection: false };
            case 'getUserAuthStatus': return { isLoggedIn: connected, canCreatePlaylist: connected, hasClientId: !!configuredId };
            case 'saveSpotifySetup': configuredId = req.clientId; connected = false; return { success: true };
            case 'initiateUserLogin':
                if (failLogin) return { error: 'Login cancelled' };
                connected = true; return { success: true };
            case 'getAlbumTracksFromSpotify':
                if (failTracks) return { error: 'Spotify denied access (403). Check Users Management.' };
                return { tracks: ['https://open.spotify.com/track/example'] };
            default: throw new Error(`Unexpected action: ${req.action}`);
        }
    } },
};
Object.defineProperty(navigator, 'clipboard', { value: { async writeText(text) {
    if (failClipboard) throw new Error('blocked');
    setupCopied.push(text);
} } });
if (location.hash === '#dark') document.documentElement.style.colorScheme = 'dark';
