console.log("Content Script Loaded for RYM Charts");

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("CS: Received message:", request.action);

  if (request.action === "extractSpotifyAlbumIds") {
    const spotifyAlbumData = [];
    const mediaLinkContainers = document.querySelectorAll('div[id^="media_link_button_container_charts_"]');
    console.log(`CS: Found ${mediaLinkContainers.length} media link containers for album IDs.`);

    mediaLinkContainers.forEach(container => {
      const dataLinksJson = container.getAttribute('data-links');
      let albumTitle = "Unknown Album";
      const titleElement = container.closest('.page_charts_section_charts_item')
                           ?.querySelector('.page_charts_section_charts_item_title .release .ui_name_locale_original');
      if (titleElement) {
        albumTitle = titleElement.textContent.trim();
      }

      if (dataLinksJson) {
        try {
          const dataLinks = JSON.parse(dataLinksJson);
          if (dataLinks.spotify) {
            for (const spotifyId in dataLinks.spotify) {
              const spotifyEntry = dataLinks.spotify[spotifyId];
              if (spotifyEntry.type === "album" || !spotifyEntry.type) {
                console.log(`CS: Found Spotify album ID: ${spotifyId} for title: ${albumTitle}`);
                spotifyAlbumData.push({ id: spotifyId, title: albumTitle });
                break; 
              }
            }
          }
        } catch (e) {
          console.error("CS: Error parsing data-links JSON:", e, dataLinksJson);
        }
      }
    });
    console.log("CS: Sending album data:", spotifyAlbumData);
    sendResponse({ albums: spotifyAlbumData });
    return true;

  } else if (request.action === "extractSpotifyLinks") {
    const spotifyLinks = new Set();
    const mediaLinkContainers = document.querySelectorAll('div[id^="media_link_button_container_charts_"]');
    console.log(`CS: Found ${mediaLinkContainers.length} media link containers for album links.`);

    mediaLinkContainers.forEach(container => {
      const dataLinksJson = container.getAttribute('data-links');
      if (dataLinksJson) {
        try {
          const dataLinks = JSON.parse(dataLinksJson);
          if (dataLinks.spotify) {
            for (const spotifyId in dataLinks.spotify) {
              const spotifyEntry = dataLinks.spotify[spotifyId];
              let linkType = "album"; 
              if (spotifyEntry.type && (spotifyEntry.type === "track" || spotifyEntry.type === "tracks")) {
                linkType = "track";
              } else if (spotifyEntry.type && spotifyEntry.type === "playlists"){
                linkType = "playlist";
              }
              const spotifyUrl = `https://open.spotify.com/${linkType}/${spotifyId}`;
              spotifyLinks.add(spotifyUrl);
            }
          }
        } catch (e) {
          console.error("CS: Error parsing data-links JSON for album links:", e, dataLinksJson);
        }
      }
    });
    console.log("CS: Sending album links:", Array.from(spotifyLinks));
    sendResponse({ links: Array.from(spotifyLinks) });
    return true;
  }
  return true;
});
