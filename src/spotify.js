(() => {
const API = 'https://api.spotify.com/v1';
class SpotifyError extends Error {
    status;
    constructor(message, status) { super(message); this.status = status; }
}
async function spotifyRequest(token, path, body) {
    const res = await fetch(`${API}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
        let detail = '';
        try {
            detail = (await res.json()).error?.message || '';
        }
        catch { /* Use status below. */ }
        const message = res.status === 401 ? 'Spotify session expired. Connect Spotify again.'
            : res.status === 403 ? 'Spotify denied access. Reconnect Spotify to grant playlist permission and check access to the Spotify app.'
                : res.status === 429 ? `Spotify rate limit reached. Try again in ${res.headers.get('Retry-After') || 'a few'} seconds.`
                    : `Spotify request failed (${res.status})${detail ? `: ${detail}` : ''}`;
        throw new SpotifyError(message, res.status);
    }
    return res.json();
}
async function albumTracks(token, id) {
    if (!/^[a-zA-Z0-9]{22}$/.test(id))
        throw new Error('Invalid Spotify album ID.');
    const tracks = [];
    let offset = 0;
    while (true) {
        const page = await spotifyRequest(token, `/albums/${id}/tracks?limit=50&offset=${offset}`);
        for (const track of page.items) {
            if (track.id && !track.is_local && track.is_playable !== false)
                tracks.push(`https://open.spotify.com/track/${track.id}`);
        }
        if (!page.next)
            break;
        if (!page.items.length)
            throw new Error('Spotify returned an empty album page. Please try again.');
        offset += page.items.length;
    }
    return tracks;
}
async function createPlaylist(token, name, links, sourceUrl) {
    const uris = [...new Set(links.map(link => {
            const match = /^https:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]{22})$/.exec(link);
            if (!match)
                throw new Error('Playlists can only contain Spotify tracks.');
            return `spotify:track:${match[1]}`;
        }))];
    if (!uris.length)
        throw new Error('No songs found for this playlist.');
    if (!name.trim())
        throw new Error('The chart has no name.');
    const source = new URL(sourceUrl);
    if (!['rateyourmusic.com', 'www.rateyourmusic.com'].includes(source.hostname) || !source.pathname.startsWith('/charts/'))
        throw new Error('Invalid RYM chart URL.');
    const playlist = await spotifyRequest(token, '/me/playlists', {
        name: name.trim().slice(0, 100), public: false,
        description: `From RateYourMusic: ${source.href}`.slice(0, 300),
    });
    const url = `https://open.spotify.com/playlist/${playlist.id}`;
    let added = 0;
    try {
        for (let i = 0; i < uris.length; i += 100) {
            const batch = uris.slice(i, i + 100);
            await spotifyRequest(token, `/playlists/${playlist.id}/items`, { uris: batch });
            added += batch.length;
        }
        return { success: true, url, added, total: uris.length };
    }
    catch (error) {
        return { url, added, total: uris.length, error: `Playlist created, but only ${added} of ${uris.length} songs were added. ${error instanceof Error ? error.message : 'Please try again later.'}` };
    }
}

Object.assign(globalThis.RymSpotify ??= {}, { SpotifyError, spotifyRequest, albumTracks, createPlaylist });
})();
