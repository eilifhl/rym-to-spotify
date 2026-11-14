# RYM to Spotify

A Firefox extension that adds a Spotify panel in the sidebar below RateYourMusic chart filters. It follows the page's typography and colors, including dark themes. The toolbar popup offers the same controls.

- **Copy Spotify links** finds and copies links in one click, without signing in.
- Connect Spotify to copy all album tracks or the first track from each album.
- **Create Spotify playlist** uses the chart's name and songs, preserves chart order, and removes duplicate tracks. Album charts can include all tracks or just the first track per album. Song charts use their linked songs.
- Playlists are private and include the source chart URL in their description.

Actions use the **current chart page only**, and only entries with Spotify links. For additional chart pages, run the action on each page. Albums are expanded fully, including albums with more than 50 songs. Playlist additions are batched in groups of 100. If adding songs fails, the panel shows the partial playlist link and the number added.

## Load in Firefox

1. Download and extract `extension.zip`, or build the repository.
2. Open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on**.
3. Select **the root `manifest.json`** (alongside `dist/`).
4. Open or reload an RYM chart page. The panel appears below the filters in the sidebar.

Existing Spotify connections need a one-time permission update: click **Enable Spotify playlists** in the panel. The extension requests Spotify's `playlist-modify-private` permission. Spotify login uses the existing app client ID and PKCE; its app configuration must allow the identity redirect URL returned by Firefox for `oauth2/spotify`. Spotify account/app eligibility and API access are controlled by Spotify. Signing into Spotify's website alone does not connect the extension.

This manifest targets Firefox. Chrome requires a service-worker manifest and a browser API compatibility layer.

## Development

The extension source and build configuration use JavaScript ES modules. Use Node.js 22.18+ and npm. Packaging also requires the `zip` command.

```sh
npm ci
npm run build
npm run dev          # build and watch both popup/background and content script
npm test             # mocked Spotify API tests
npm run test:browser # headless Chromium fixture tests; requires chromium on PATH
npm run package     # build and update extension.zip
```

The content script is built as a standalone IIFE so it can run without module imports. The UI lives in a shadow root to avoid affecting RYM's page styles, while inheriting its font and text color. It also mounts when chart results load dynamically.

Browser tests cover panel placement, preferred Spotify editions, malformed data, duplicate links, copying, album expansion, playlist naming, clipboard fallback, signed-out controls, and duplicate prevention in light and dark fixtures. API tests cover pagination, batching, private playlist creation, validation, permission errors, and partial failures. Live Spotify OAuth and real account playlist creation require manual testing with an authorized account.

Spotify API references: [Create Playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist) and [Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist).
