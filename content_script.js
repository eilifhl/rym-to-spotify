browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractSpotifyLinks") {
    const spotifyLinks = new Set(); // Use a Set to avoid duplicates

    // Selector for the containers of media links for each chart item
    const mediaLinkContainers = document.querySelectorAll('div[id^="media_link_button_container_charts_"]');

    mediaLinkContainers.forEach(container => {
      const dataLinksJson = container.getAttribute('data-links');
      if (dataLinksJson) {
        try {
          const dataLinks = JSON.parse(dataLinksJson);
          if (dataLinks.spotify) {
            for (const spotifyId in dataLinks.spotify) {
              const spotifyEntry = dataLinks.spotify[spotifyId];
              let linkType = "album"; // Default to album
              if (spotifyEntry.type && (spotifyEntry.type === "track" || spotifyEntry.type === "tracks")) {
                linkType = "track";
              } else if (spotifyEntry.type && spotifyEntry.type === "playlists"){
                linkType = "playlist"; // though less common for single items in charts
              }
              // Add more types if necessary based on RYM's data-links structure
              
              // Construct the URL
              const spotifyUrl = `https://open.spotify.com/${linkType}/${spotifyId}`;
              spotifyLinks.add(spotifyUrl);
            }
          }
        } catch (e) {
          console.error("Error parsing data-links JSON:", e, dataLinksJson);
        }
      }
    });
    
    sendResponse({ links: Array.from(spotifyLinks) });
    return true; // Indicates that the response will be sent asynchronously
  }
});
