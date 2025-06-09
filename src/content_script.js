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
  let titleElement = chartItemElement?.querySelector('.page_charts_section_charts_item_title .release .ui_name_locale_original');
  if (!titleElement) { // Fallback for song titles or if structure differs slightly
    titleElement = chartItemElement?.querySelector('.page_charts_section_charts_item_title > a .ui_name_locale_original');
  }
  if (!titleElement) { // Broader fallback
    titleElement = chartItemElement?.querySelector('.page_charts_section_charts_item_title > a');
  }
  return titleElement ? titleElement.textContent.trim() : "Unknown Album";
}

// --- Action Handler Functions ---

/**
 * Extracts Spotify album IDs and titles from the RYM chart page.
 * Ensures unique album IDs are returned, prioritizing the first album-type link per item.
 * @returns {{albums: Array<{id: string, title: string}>}}
 */
function extractSpotifyAlbumIds() {
  const uniqueAlbums = new Map();
  const mediaLinkContainers = document.querySelectorAll('div[id^="media_link_button_container_charts_"]');
  console.log(`CS: Found ${mediaLinkContainers.length} media link containers for album IDs.`);

  mediaLinkContainers.forEach(container => {
    const dataLinksJson = container.getAttribute('data-links');
    const dataLinks = parseJsonSafe(dataLinksJson, "album ID data-links");

    if (!dataLinks || !dataLinks.spotify || Object.keys(dataLinks.spotify).length === 0) return;

    const albumTitle = getAlbumTitle(container);

    let chosenSpotifyIdForAlbum = null;

    // Prioritize default if available, otherwise first album type
    for (const spotifyId in dataLinks.spotify) {
      const spotifyEntry = dataLinks.spotify[spotifyId];
      if (spotifyEntry.type === "album") {
        if (spotifyEntry.default === true) {
          chosenSpotifyIdForAlbum = spotifyId;
          break;
        }
        if (!chosenSpotifyIdForAlbum) {
          chosenSpotifyIdForAlbum = spotifyId;
        }
      }
    }

    if (chosenSpotifyIdForAlbum && !uniqueAlbums.has(chosenSpotifyIdForAlbum)) {
      console.log(`CS: Found Spotify album ID: ${chosenSpotifyIdForAlbum} for title: "${albumTitle}"`);
      uniqueAlbums.set(chosenSpotifyIdForAlbum, albumTitle);
    }
  });

  const spotifyAlbumData = Array.from(uniqueAlbums, ([id, title]) => ({ id, title }));
  console.log("CS: Extracted unique album ID data:", spotifyAlbumData);
  return { albums: spotifyAlbumData };
}

/**
 * Extracts Spotify links (album, track, playlist) from the RYM chart page.
 * Prioritizes the 'default' link, otherwise picks the first available link per RYM item.
 * @returns {{links: string[]}}
 */
function extractSpotifyLinks() {
  const spotifyLinks = new Set(); // Use Set to avoid duplicate links from different items that might point to the same URL
  const mediaLinkContainers = document.querySelectorAll('div[id^="media_link_button_container_charts_"]');
  console.log(`CS: Found ${mediaLinkContainers.length} media link containers for general links.`);

  mediaLinkContainers.forEach(container => {
    const dataLinksJson = container.getAttribute('data-links');
    const dataLinks = parseJsonSafe(dataLinksJson, "general link data-links");

    if (!dataLinks || !dataLinks.spotify || Object.keys(dataLinks.spotify).length === 0) return;

    let chosenSpotifyId = null;
    let chosenSpotifyEntry = null;

    for (const spotifyId in dataLinks.spotify) {
      const spotifyEntry = dataLinks.spotify[spotifyId];
      if (spotifyEntry.default === true && spotifyEntry.type) {
        chosenSpotifyId = spotifyId;
        chosenSpotifyEntry = spotifyEntry;
        break; // Found default, use this one
      }
    }

    if (!chosenSpotifyId) {
      for (const spotifyId in dataLinks.spotify) {
        const spotifyEntry = dataLinks.spotify[spotifyId];
        if (spotifyEntry.type) {
          chosenSpotifyId = spotifyId;
          chosenSpotifyEntry = spotifyEntry;
          break;
        }
      }
    }

    if (!chosenSpotifyId && Object.keys(dataLinks.spotify).length > 0) {
      const firstSpotifyId = Object.keys(dataLinks.spotify)[0];
      chosenSpotifyId = firstSpotifyId;
      chosenSpotifyEntry = dataLinks.spotify[firstSpotifyId];
    }


    // If we have a chosen ID and its entry, construct the link
    if (chosenSpotifyId && chosenSpotifyEntry) {
      let linkType = "album";

      if (chosenSpotifyEntry.type) {
        switch (chosenSpotifyEntry.type.toLowerCase()) {
          case "track":
          case "tracks":
            linkType = "track";
            break;
          case "playlist":
          case "playlists":
            linkType = "playlist";
            break;
          case "album":
            linkType = "album";
            break;
        }
      }

      const spotifyUrl = `https://open.spotify.com/${linkType}/${chosenSpotifyId}`;
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
