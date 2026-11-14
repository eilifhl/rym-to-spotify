# RYM to Spotify

A Firefox extension that adds a Spotify panel in the sidebar below RateYourMusic chart filters. It follows the page's typography and colors, including dark themes. The toolbar popup offers the same controls.

- **Copy Spotify links** finds and copies links in one click, without signing in.
- Connect Spotify to copy all album tracks or the first track from each album.
- **Create Spotify playlist** uses the chart's name and songs, preserves chart order, and removes duplicate tracks. Album charts can include all tracks or just the first track per album. Song charts use their linked songs.
- Playlists are private and include the source chart URL in their description.

Actions use the **current chart page only**, and only entries with Spotify links. For additional chart pages, run the action on each page. Albums are expanded fully, including albums with more than 50 songs. Playlist additions are batched in groups of 100. If adding songs fails, the panel shows the partial playlist link and the number added.

## Load in Firefox

1. Download and extract `extension.zip`, or use the repository directly.
2. Open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on**.
3. Select **the root `manifest.json`** (alongside `src/`).
4. Open or reload an RYM chart page. The panel appears below the filters in the sidebar.

If the panel appears only after clicking the extension icon, check Firefox's site-access controls for the extension and choose **Always allow on rateyourmusic.com** (wording varies by Firefox version). Content scripts require site access to run automatically; an extension update cannot override a permission you have withheld. After granting access, refresh the chart tab.

Existing Spotify connections need a one-time permission update: click **Enable Spotify playlists** in the panel. The extension requests Spotify's `playlist-modify-private` permission. Spotify login uses the existing app client ID and PKCE; its app configuration must allow the identity redirect URL returned by Firefox for `oauth2/spotify`. Spotify account/app eligibility and API access are controlled by Spotify. Signing into Spotify's website alone does not connect the extension.

This manifest targets Firefox. Chrome requires a service-worker manifest and a browser API compatibility layer.

## Development

The extension runs directly from the JavaScript, HTML, and CSS files in `src/`. There is no build step, bundler, dependency installation, or generated `dist/` folder.

After editing a source file, click **Reload** for the extension in `about:debugging`, then refresh the RYM chart tab. In particular, edit `src/panel.css` to change the sidebar panel styling. Make sure Firefox has loaded the `manifest.json` from the folder you are editing; an extracted ZIP in another folder is a separate copy.

The manifest lists shared scripts in dependency order. Each script uses a local scope and shares helpers through `globalThis.RymSpotify`. The panel loads `src/panel.css` directly inside its shadow root, keeping its styles separate from RYM's page styles while inheriting the page's font and text color. Only that stylesheet is exposed to RYM chart pages. The panel also mounts when chart results load dynamically.

Node.js 22.18+ is only needed for the optional tests and packaging commands. Packaging requires the `zip` command.

```sh
npm test             # mocked Spotify API tests
npm run test:browser # headless Chromium fixture tests; requires chromium on PATH
npm run package     # ZIP the extension files directly; no compilation
```

Browser tests cover panel placement, preferred Spotify editions, malformed data, duplicate links, copying, album expansion, playlist naming, clipboard fallback, signed-out controls, and duplicate prevention in light and dark fixtures. API tests cover pagination, batching, private playlist creation, validation, permission errors, and partial failures. Live Spotify OAuth and real account playlist creation require manual testing with an authorized account.

Spotify API references: [Create Playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist) and [Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist).
