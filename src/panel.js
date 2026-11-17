(() => {
const { ACTIONS } = globalThis.RymSpotify;
function mountPanel(root, getChart) {
    root.innerHTML = `<link rel="stylesheet" href="${browser.runtime.getURL('src/panel.css')}">
    <section class="rym-panel" aria-label="RYM to Spotify">
      <header><strong>RYM to Spotify</strong><div class="account-actions"><button class="setup secondary" type="button">Spotify setup</button><button class="auth" type="button">Set up Spotify</button></div></header>
      <div class="controls">
        <h2>Copy Spotify links</h2>
        <p class="description">Copies links from this chart page to your clipboard, in chart order.</p>
        <label class="mode-label">Tracks to include <select class="mode" aria-label="Tracks to include in copied links">
          <option value="album">Chart links</option><option value="allTracks">All tracks from albums</option><option value="firstTrack">First track from each album</option>
        </select></label>
        <div class="copy-action">
          <button class="copy" type="button">Copy links</button>
          <p class="status copy-status" role="status" aria-live="polite"></p>
        </div>
        <details hidden><summary>Links (select to copy manually)</summary><textarea readonly aria-label="Spotify links"></textarea></details>
      </div>
      <div class="playlist-controls" hidden>
        <h2>Create a Spotify playlist</h2>
        <p class="description">Creates a private playlist in your Spotify account using the chart’s name.</p>
        <label>Tracks to include <select class="playlist-mode" aria-label="Tracks to include in playlist"><option value="allTracks">All tracks from albums</option><option value="firstTrack">First track from each album</option></select></label>
        <label>Chart pages <select class="playlist-range" aria-label="Chart pages to include">
          <option value="current">This page only</option><option value="pages">Pages 1 through…</option><option value="rating">Until rating drops below…</option>
        </select></label>
        <label class="end-page-label" hidden>Last page <input class="end-page" type="number" min="1" step="1" value="3"></label>
        <label class="minimum-rating-label" hidden>Minimum rating <input class="minimum-rating" type="number" min="0" max="5" step="0.01" value="3.50"></label>
        <small class="range-help" hidden></small>
        <button class="playlist" type="button">Create playlist</button>
        <p class="status playlist-status" role="status" aria-live="polite"></p>
        <a class="result" hidden target="_blank" rel="noopener noreferrer">Open playlist in Spotify ↗</a>
      </div>
      <p class="status auth-status" role="status" aria-live="polite"></p>
    </section>`;
    const el = (selector) => root.querySelector(selector);
    const auth = el('.auth');
    const copy = el('.copy');
    const playlist = el('.playlist');
    const mode = el('.mode');
    const playlistMode = el('.playlist-mode');
    const range = el('.playlist-range');
    const endPage = el('.end-page');
    const minimumRating = el('.minimum-rating');
    const status = el('.auth-status');
    const result = el('.result');
    let loggedIn = false;
    let canCreate = false;
    let busy = false;
    let hasAlbums = false;
    let hasClientId = false;
    const message = (text, error = false, target = status) => { target.textContent = text; target.dataset.error = String(error); };
    function update() {
        auth.textContent = loggedIn ? 'Disconnect Spotify' : hasClientId ? 'Connect Spotify' : 'Set up Spotify';
        auth.disabled = busy;
        el('.setup').disabled = busy;
        el('.setup').hidden = !hasClientId;
        copy.disabled = busy;
        playlist.disabled = busy;
        mode.disabled = busy;
        playlistMode.disabled = busy;
        range.disabled = busy;
        endPage.disabled = busy;
        minimumRating.disabled = busy;
        for (const option of Array.from(mode.options))
            option.disabled = option.value !== 'album' && !loggedIn;
        if (!loggedIn)
            mode.value = 'album';
        el('.playlist-controls').hidden = !loggedIn;
        el('.mode-label').hidden = !hasAlbums;
        playlistMode.parentElement.hidden = !hasAlbums;
        playlist.textContent = canCreate ? 'Create playlist' : 'Enable Spotify playlists';
    }
    function updateRange() {
        el('.range-help').hidden = range.value === 'current';
        el('.end-page-label').hidden = range.value !== 'pages';
        el('.minimum-rating-label').hidden = range.value !== 'rating';
        el('.range-help').textContent = range.value === 'current'
            ? 'Uses this chart page. Creates a private playlist.'
            : range.value === 'pages'
                ? 'Starts at page 1 and includes the last page. Entries without Spotify links are skipped. Keep this panel open.'
                : 'Starts at page 1 and stops at the first entry below this rating. Equal ratings are included. Keep this panel open.';
    }
    range.onchange = updateRange;
    async function checkAuth() {
        try {
            const res = await browser.runtime.sendMessage({ action: ACTIONS.GET_USER_AUTH_STATUS });
            loggedIn = res.isLoggedIn;
            canCreate = res.canCreatePlaylist;
            hasClientId = res.hasClientId;
            hasAlbums = (await getChart()).albums.length > 0;
            update();
        }
        catch {
            message('Could not connect to the extension. Reload this page after reloading the extension.', true);
        }
    }
    async function collect(chart, selection, report) {
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
            report(`Getting tracks: ${album?.title || 'Album'}…`);
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
        const report = (text, error = false) => message(text, error, el(create ? '.playlist-status' : '.copy-status'));
        busy = true;
        update();
        if (create) result.hidden = true;
        else el('details').hidden = true;
        report(create ? 'Preparing playlist…' : 'Finding Spotify links…');
        try {
            if (create && !canCreate) {
                const res = await browser.runtime.sendMessage({ action: ACTIONS.INITIATE_USER_LOGIN });
                if (res.error)
                    throw new Error(res.error);
                await checkAuth();
                if (!canCreate)
                    throw new Error('Spotify playlist permission is required.');
            }
            const options = create ? { range: range.value, endPage: endPage.value, minimumRating: minimumRating.value } : undefined;
            if (create && range.value === 'pages' && !endPage.reportValidity()) throw new Error('Enter a valid last page.');
            if (create && range.value === 'rating' && !minimumRating.reportValidity()) throw new Error('Enter a valid minimum rating.');
            const chart = await getChart(options, text => report(text));
            const links = await collect(chart, create ? playlistMode.value : mode.value, report);
            if (!links.length)
                throw new Error('No Spotify links found within the selected chart range.');
            if (create) {
                report(`Creating “${chart.title}” with ${links.length} songs…`);
                const res = await browser.runtime.sendMessage({ action: ACTIONS.CREATE_PLAYLIST, name: chart.title, tracks: links, sourceUrl: chart.url });
                if (res.url) {
                    result.href = res.url;
                    result.hidden = false;
                }
                if (res.error)
                    throw new Error(res.error);
                report(`Created “${chart.title}” with ${res.added} songs.${chart.pagesRead ? ` Read ${chart.pagesRead} chart pages.` : ''}${chart.skipped ? ` Skipped ${chart.skipped} entries without Spotify links.` : ''}`);
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
                report('Copied to clipboard');
            }
        }
        catch (error) {
            report(error instanceof Error ? error.message : 'Something went wrong.', true);
        }
        finally {
            busy = false;
            await checkAuth();
            update();
        }
    }
    copy.onclick = () => { void run(false); };
    playlist.onclick = () => { void run(true); };
    async function openSetup() {
        const res = await browser.runtime.sendMessage({ action: ACTIONS.OPEN_SPOTIFY_SETUP });
        if (res.error) throw new Error(res.error);
    }
    el('.setup').onclick = () => { void openSetup().catch(error => message(error.message, true)); };
    auth.onclick = async () => {
        busy = true;
        update();
        try {
            if (!loggedIn && !hasClientId) {
                await openSetup();
                return;
            }
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

Object.assign(globalThis.RymSpotify ??= {}, { mountPanel });
})();
