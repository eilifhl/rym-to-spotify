import { ACTIONS } from './actions.js';
import styles from './panel.css?inline';
export function mountPanel(root, getChart) {
    root.innerHTML = `<style>${styles}</style>
    <section aria-label="RYM to Spotify">
      <header><strong>RYM to Spotify</strong><button class="auth" type="button">Connect Spotify</button></header>
      <p class="scope">Spotify links from this chart page, in chart order.</p>
      <div class="controls">
        <label class="mode-label">Copy <select class="mode" aria-label="Links to copy">
          <option value="album">Chart links</option><option value="allTracks">All tracks from albums</option><option value="firstTrack">First track from each album</option>
        </select></label>
        <button class="copy" type="button">Copy Spotify links</button>
      </div>
      <div class="playlist-controls" hidden>
        <label>Playlist songs <select class="playlist-mode" aria-label="Songs to include in playlist"><option value="allTracks">All tracks from albums</option><option value="firstTrack">First track from each album</option></select></label>
        <button class="playlist" type="button">Create Spotify playlist</button>
        <small>Uses the chart name and songs on this page. Creates a private playlist.</small>
      </div>
      <p class="status" role="status" aria-live="polite"></p>
      <a class="result" hidden target="_blank" rel="noopener noreferrer">Open playlist in Spotify ↗</a>
      <details hidden><summary>Links (select to copy manually)</summary><textarea readonly aria-label="Spotify links"></textarea></details>
    </section>`;
    const el = (selector) => root.querySelector(selector);
    const auth = el('.auth');
    const copy = el('.copy');
    const playlist = el('.playlist');
    const mode = el('.mode');
    const playlistMode = el('.playlist-mode');
    const status = el('.status');
    const result = el('.result');
    let loggedIn = false;
    let canCreate = false;
    let busy = false;
    let hasAlbums = false;
    const message = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
    function update() {
        auth.textContent = loggedIn ? 'Disconnect Spotify' : 'Connect Spotify';
        auth.disabled = busy;
        copy.disabled = busy;
        playlist.disabled = busy;
        mode.disabled = busy;
        playlistMode.disabled = busy;
        for (const option of Array.from(mode.options))
            option.disabled = option.value !== 'album' && !loggedIn;
        if (!loggedIn)
            mode.value = 'album';
        el('.playlist-controls').hidden = !loggedIn;
        el('.mode-label').hidden = !hasAlbums;
        playlistMode.parentElement.hidden = !hasAlbums;
        playlist.textContent = canCreate ? 'Create Spotify playlist' : 'Enable Spotify playlists';
    }
    async function checkAuth() {
        try {
            const res = await browser.runtime.sendMessage({ action: ACTIONS.GET_USER_AUTH_STATUS });
            loggedIn = res.isLoggedIn;
            canCreate = res.canCreatePlaylist;
            hasAlbums = (await getChart()).albums.length > 0;
            update();
        }
        catch {
            message('Could not connect to the extension. Reload this page after reloading the extension.', true);
        }
    }
    async function collect(chart, selection) {
        if (selection === 'album')
            return chart.links;
        const tracks = [];
        // Expand in page order, including directly linked songs on mixed charts.
        for (const link of chart.links) {
            if (link.includes('/track/')) {
                tracks.push(link);
                continue;
            }
            if (!loggedIn)
                throw new Error('Connect Spotify to get album tracks.');
            const id = link.split('/').pop();
            const album = chart.albums.find(album => album.id === id);
            message(`Getting tracks: ${album?.title || 'Album'}…`);
            const res = await browser.runtime.sendMessage({ action: ACTIONS.GET_ALBUM_TRACKS, albumId: id });
            if (res.error)
                throw new Error(res.error);
            tracks.push(...(selection === 'firstTrack' ? res.tracks.slice(0, 1) : res.tracks));
        }
        return [...new Set(tracks)];
    }
    async function run(create) {
        if (busy)
            return;
        busy = true;
        update();
        result.hidden = true;
        message(create ? 'Preparing playlist…' : 'Finding Spotify links…');
        try {
            if (create && !canCreate) {
                const res = await browser.runtime.sendMessage({ action: ACTIONS.INITIATE_USER_LOGIN });
                if (res.error)
                    throw new Error(res.error);
                await checkAuth();
                if (!canCreate)
                    throw new Error('Spotify playlist permission is required.');
            }
            const chart = await getChart();
            const links = await collect(chart, create ? playlistMode.value : mode.value);
            if (!links.length)
                throw new Error('No Spotify links found on this page.');
            if (create) {
                message(`Creating “${chart.title}” with ${links.length} songs…`);
                const res = await browser.runtime.sendMessage({ action: ACTIONS.CREATE_PLAYLIST, name: chart.title, tracks: links, sourceUrl: chart.url });
                if (res.url) {
                    result.href = res.url;
                    result.hidden = false;
                }
                if (res.error)
                    throw new Error(res.error);
                message(`Created “${chart.title}” with ${res.added} songs.`);
            }
            else {
                el('textarea').value = links.join('\n');
                try {
                    await navigator.clipboard.writeText(links.join('\n'));
                }
                catch {
                    el('details').hidden = false;
                    el('details').open = true;
                    el('textarea').select();
                    throw new Error('Clipboard access was blocked. Select and copy the links below.');
                }
                message(`Copied ${links.length} Spotify links.`);
            }
        }
        catch (error) {
            message(error instanceof Error ? error.message : 'Something went wrong.', true);
        }
        finally {
            busy = false;
            await checkAuth();
            update();
        }
    }
    copy.onclick = () => { void run(false); };
    playlist.onclick = () => { void run(true); };
    auth.onclick = async () => {
        busy = true;
        update();
        try {
            const res = await browser.runtime.sendMessage({ action: loggedIn ? ACTIONS.USER_LOGOUT : ACTIONS.INITIATE_USER_LOGIN });
            if (res.error)
                throw new Error(res.error);
            message('');
        }
        catch (error) {
            message(error instanceof Error ? error.message : 'Spotify connection failed.', true);
        }
        finally {
            busy = false;
            await checkAuth();
        }
    };
    browser.storage.onChanged.addListener(() => { void checkAuth(); });
    void checkAuth();
}
