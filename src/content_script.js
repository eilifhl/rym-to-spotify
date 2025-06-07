console.log("Content Script Loaded for RYM Charts");

// --- Helper Functions ---

/**
 * Safely parses a JSON string.
 * @param {string} jsonString - The JSON string to parse.
 * @param {string} [context="data"] - Description for error logging.
 * @returns {object|null} The parsed object, or null if parsing fails.
 */
function parseJsonSafe(jsonString, context = "data") {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error(`CS: Error parsing ${context} JSON:`, e, jsonString);
    return null;
  }
}

/**
 * Extracts the album title from the DOM structure relative to the media container.
 * @param {HTMLElement} mediaContainerEl - The media link container element.
 * @returns {string} The album title, or "Unknown Album" if not found.
 */
function getAlbumTitle(mediaContainerEl) {
  const chartItemElement = mediaContainerEl.closest('.page_charts_section_charts_item');
  const titleElement = chartItemElement?.querySelector('.page_charts_section_charts_item_title .release .ui_name_locale_original');
  return titleElement ? titleElement.textContent.trim() : "Unknown Album";
}

// --- Action Handler Functions ---

/**
 * Extracts Spotify album IDs and titles from the RYM chart page.
 * @returns {{albums: Array<{id: string, title: string}>}}
 */
function extractSpotifyAlbumIds() {
  const spotifyAlbumData = [];
  const mediaLinkContainers = document.querySelectorAll('div[id^="media_link_button_container_charts_"]');
  console.log(`CS: Found ${mediaLinkContainers.length} media link containers for album IDs.`);

  mediaLinkContainers.forEach(container => {
    const dataLinksJson = container.getAttribute('data-links');
    const dataLinks = parseJsonSafe(dataLinksJson, "album ID data-links");

    if (!dataLinks || !dataLinks.spotify) return;
    
    const albumTitle = getAlbumTitle(container);

    for (const spotifyId in dataLinks.spotify) {
      const spotifyEntry = dataLinks.spotify[spotifyId];
      // Prioritize entries explicitly typed as "album" or untyped (assumed album).
      if (spotifyEntry.type === "album" || !spotifyEntry.type) {
        console.log(`CS: Found Spotify album ID: ${spotifyId} for title: "${albumTitle}"`);
        spotifyAlbumData.push({ id: spotifyId, title: albumTitle });
        break; 
      }
    }
  });

  console.log("CS: Extracted album ID data:", spotifyAlbumData);
  return { albums: spotifyAlbumData };
}

/**
 * Extracts Spotify links (album, track, playlist) from the RYM chart page.
 * @returns {{links: string[]}}
 */
function extractSpotifyLinks() {
  const spotifyLinks = new Set(); // Use Set to avoid duplicate links
  const mediaLinkContainers = document.querySelectorAll('div[id^="media_link_button_container_charts_"]');
  console.log(`CS: Found ${mediaLinkContainers.length} media link containers for general links.`);

  mediaLinkContainers.forEach(container => {
    const dataLinksJson = container.getAttribute('data-links');
    const dataLinks = parseJsonSafe(dataLinksJson, "general link data-links");

    if (!dataLinks || !dataLinks.spotify) return;

    for (const spotifyId in dataLinks.spotify) {
      const spotifyEntry = dataLinks.spotify[spotifyId];
      let linkType = "album";

      if (spotifyEntry.type) {
        switch (spotifyEntry.type.toLowerCase()) {
          case "track":
          case "tracks":
            linkType = "track";
            break;
          case "playlist":
          case "playlists":
            linkType = "playlist";
            break;
        }
      }
      const spotifyUrl = `https://open.spotify.com/${linkType}/${spotifyId}`;
      spotifyLinks.add(spotifyUrl);
    }
  });
  const linksArray = Array.from(spotifyLinks);
  console.log("CS: Extracted Spotify links:", linksArray);
  return { links: linksArray };
}

// --- Main Message Listener for Content Script ---
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("CS: Received message:", request.action);

  let responseData;
  switch (request.action) {
    case "extractSpotifyAlbumIds":
      responseData = extractSpotifyAlbumIds();
      break;
    case "extractSpotifyLinks":
      responseData = extractSpotifyLinks();
      break;
    default:
      console.warn(`CS: Unknown action received: ${request.action}`);
      responseData = { error: `Unknown action: ${request.action}` };
      break;
  }
  sendResponse(responseData);
  return true;
});
