# RYM to Spotify

A Firefox extension that adds a Spotify panel in the sidebar below RateYourMusic chart filters. It follows the page's typography and colors, including dark themes. The toolbar popup offers the same controls.

- **Copy Spotify links** finds and copies links in one click, without signing in.
- Connect Spotify to copy all album tracks or the first track from each album.
- **Create Spotify playlist** uses the chart's name and songs, preserves chart order, and removes duplicate tracks. Album charts can include all tracks or just the first track per album. Song charts use their linked songs.
- Playlists are private and include the source chart URL in their description.

Copying links uses the **current chart page**. When creating a playlist, choose **This page only**, **Pages 1 through…**, or **Until rating drops below…**. Page and rating ranges always start at page 1. The page limit is inclusive. A minimum rating of 4.00 includes entries rated exactly 4.00 and stops at the first entry below it, even when that entry has no Spotify link. Use a chart whose rating order matches the cutoff you want; this is a stop-at-first-below rule, not a search for every qualifying entry later in the chart.

Only entries with Spotify links are added. Additional pages are requested one at a time with a pause between requests. Keep the page panel or popup open until creation finishes. If RYM blocks a request, returns a browser-check page, repeats a page, or a required rating cannot be read, the operation stops before creating a playlist. The extension follows RYM's own pagination links and uses the chart page's existing access; it requests no additional permissions. Albums are expanded fully, including albums with more than 50 songs. Playlist additions are batched in groups of 100. If adding songs fails, the panel shows the partial playlist link and the number added.

## Load in Firefox

1. Download and extract `extension.zip`, or use the repository directly.
2. Open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on**.
3. Select **the root `manifest.json`** (alongside `src/`).
4. Open or reload an RYM chart page. The panel appears below the filters in the sidebar.

If the panel appears only after clicking the extension icon, check Firefox's site-access controls for the extension and choose **Always allow on rateyourmusic.com** (wording varies by Firefox version). Content scripts require site access to run automatically; an extension update cannot override a permission you have withheld. After granting access, refresh the chart tab.

## Connect your own Spotify app

Click **Set up Spotify** in the chart panel, or **Spotify setup** in the toolbar popup (available even away from RYM). The guide opens in its own tab so it stays visible while you visit Spotify's dashboard. You can also open it from the extension's preferences in Firefox's Add-ons Manager.

1. Create a personal app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), using the account you want to use for playlists. Choose **Web API** if asked. Spotify currently requires the Development Mode app owner to have Premium; see [Spotify's requirements](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
2. Use **Copy redirect URL** in the guide and register that exact URL in your app's **Redirect URIs**. Save the app settings. The guide gets the URL from the same Firefox API call used during login; do not substitute an RYM or Spotify page URL.
3. Copy your app's **Client ID** into **Your Spotify Client ID**, then click **Save and connect**. Approve private playlist creation in Spotify's login window. No Client Secret is needed or requested.
4. Select **Test album access** to fetch tracks from a sample album, or paste your own Spotify album link first. The test does not create or change playlists. When it succeeds, return to an RYM chart and create your playlist.

The Client ID is stored locally in your browser and used for both PKCE login and token refresh. Changing it clears the previous app's tokens; disconnecting Spotify keeps your chosen Client ID for next time. Existing connections from older versions continue using the original shared app until disconnected or replaced. If an existing connection needs playlist permission, select **Enable Spotify playlists**.

For **Invalid redirect URI**, compare your app settings with the exact URL shown in the guide, including the trailing slash. For **403 access denied**, check Premium eligibility, the account used to sign in, and the app's **Users Management**. Personal apps remain subject to Spotify's Development Mode restrictions. Signing into Spotify's website alone does not connect the extension.

This manifest targets Firefox. Chrome requires a service-worker manifest and a browser API compatibility layer.

## Development

The extension runs directly from the JavaScript, HTML, and CSS files in `src/`. There is no build step, bundler, dependency installation, or generated `dist/` folder.

After editing a source file, click **Reload** for the extension in `about:debugging`, then refresh the RYM chart tab. In particular, edit `src/panel.css` to change the sidebar panel styling. Make sure Firefox has loaded the `manifest.json` from the folder you are editing; an extracted ZIP in another folder is a separate copy.

The extension logo is `src/icon.svg`. The manifest uses it for the Firefox toolbar and Add-ons Manager. Replace this file and reload the extension to change the logo; there is no icon upload setting in Add-ons Manager.

The manifest lists shared scripts in dependency order. Each script uses a local scope and shares helpers through `globalThis.RymSpotify`. The panel loads `src/panel.css` directly inside its shadow root, keeping its styles separate from RYM's page styles while inheriting the page's font and text color. Only that stylesheet is exposed to RYM chart pages. The panel also mounts when chart results load dynamically.

Node.js 22.18+ is only needed for the optional tests and packaging commands. Packaging requires the `zip` command.

```sh
npm test             # mocked Spotify API and connection/setup tests
npm run test:browser # headless Chromium fixture tests; requires chromium on PATH
npm run package     # ZIP the extension files directly; no compilation
```

Browser tests cover panel placement, preferred Spotify editions, malformed data, duplicate links, copying, album expansion, playlist naming, clipboard fallback, signed-out controls, duplicate prevention, inclusive page/rating limits, starting from a later page, and blocked chart responses in light and dark fixtures. The setup page is also checked in wide/light and narrow/dark layouts for redirect copying, validation, cancelled-login retry, album testing, and error feedback. API tests cover pagination, batching, private playlist creation, validation, permission errors, and partial failures. Connection tests cover saved Client IDs, PKCE parameters, legacy connections, token refresh, app switching, and in-flight login/refresh cancellation. Live Spotify OAuth and real account playlist creation require manual testing with an authorized account.

Spotify API references: [Create Playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist) and [Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist).
