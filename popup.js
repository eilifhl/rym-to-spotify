document.addEventListener('DOMContentLoaded', async function() {
  const getLinksBtn = document.getElementById('getLinksBtn');
  const copyLinksBtn = document.getElementById('copyLinksBtn');
  const linksArea = document.getElementById('linksArea');
  const statusDiv = document.getElementById('status');
  const linkTypeRadios = document.querySelectorAll('input[name="linkType"]');
  let extractedContent = [];

  try {
    const tokenStatus = await browser.runtime.sendMessage({ action: "getAppTokenStatus" });
    if (tokenStatus && !tokenStatus.hasToken) {
        statusDiv.textContent = "Spotify app token might need to be fetched. Click 'Get Links'.";
        statusDiv.className = 'info';
    }
  } catch (e) {
    console.warn("Could not check app token status on load", e);
  }


  getLinksBtn.addEventListener('click', async () => {
    linksArea.value = 'Extracting...';
    copyLinksBtn.disabled = true;
    statusDiv.textContent = 'Working...';
    statusDiv.className = 'info';
    extractedContent = [];
    let selectedLinkType = 'album';
    linkTypeRadios.forEach(radio => {
      if (radio.checked) {
        selectedLinkType = radio.value;
      }
    });

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes("rateyourmusic.com/charts/")) {
        linksArea.value = 'Not an RYM chart page.';
        statusDiv.textContent = 'Please navigate to an RYM chart page.';
        statusDiv.className = 'error';
        return;
      }

      if (selectedLinkType === 'album') {
        const response = await browser.tabs.sendMessage(tab.id, { action: "extractSpotifyLinks" });
        if (response && response.links) {
          extractedContent = response.links;
          if (extractedContent.length > 0) {
            linksArea.value = extractedContent.join('\n');
            statusDiv.textContent = `Found ${extractedContent.length} Spotify album links.`;
            statusDiv.className = 'success';
            copyLinksBtn.disabled = false;
          } else {
            linksArea.value = 'No Spotify album links found on this page.';
            statusDiv.textContent = 'No album links found.';
             statusDiv.className = 'info';
          }
        } else {
          throw new Error("Could not extract album links from page.");
        }
      } else {
const albumIdResponse = await browser.tabs.sendMessage(tab.id, { action: "extractSpotifyAlbumIds" });
console.log("POPUP: Received albumIdResponse:", JSON.stringify(albumIdResponse, null, 2));
        if (!albumIdResponse || !albumIdResponse.albums || albumIdResponse.albums.length === 0) {
          linksArea.value = 'No Spotify album IDs found on this page to fetch tracks for.';
          statusDiv.textContent = 'No albums found on RYM page.';
          statusDiv.className = 'info';
          return;
        }

        statusDiv.textContent = `Found ${albumIdResponse.albums.length} albums. Fetching tracks...`;
        let tracksProcessed = 0;

        for (const albumData of albumIdResponse.albums) {
          tracksProcessed++;
          statusDiv.textContent = `Fetching tracks for "${albumData.title}" (${tracksProcessed}/${albumIdResponse.albums.length})...`;
          try {
            const trackResponse = await browser.runtime.sendMessage({
              action: "getAlbumTracksFromSpotify",
              albumId: albumData.id
            });
            console.log(`POPUP: Raw trackResponse from BG for ${albumData.id} ("${albumData.title}"):`, trackResponse);

            if (trackResponse && trackResponse.error) {
              console.warn(`POPUP: BG reported error for album ${albumData.id} ("${albumData.title}"): ${trackResponse.error}`);
            } else if (trackResponse && Array.isArray(trackResponse.tracks) && trackResponse.tracks.length > 0) {
              console.log(`POPUP: Successfully got ${trackResponse.tracks.length} tracks for ${albumData.title}`);
              if (selectedLinkType === 'allTracks') {
                extractedContent.push(...trackResponse.tracks);
              } else if (selectedLinkType === 'firstTrack') {
                if (trackResponse.tracks[0]) { 
                    extractedContent.push(trackResponse.tracks[0]);
                } else {
                    console.warn(`POPUP: Got tracks array for ${albumData.title}, but it was empty (unexpected).`);
                }
              }
            } else {
               console.warn(`POPUP: No tracks found in response or unexpected response structure from BG for album ${albumData.id} ("${albumData.title}"):`, trackResponse);
            }
          } catch (e) {
             console.error(`POPUP: Error messaging background script for album ${albumData.id} ("${albumData.title}"):`, e);
          }
          await new Promise(resolve => setTimeout(resolve, 150));
        }

        if (extractedContent.length > 0) {
          linksArea.value = extractedContent.join('\n');
          statusDiv.textContent = `Extracted ${extractedContent.length} track links.`;
          statusDiv.className = 'success';
          copyLinksBtn.disabled = false;
        } else {
          linksArea.value = 'No tracks found for the albums on this page, or errors occurred.';
          statusDiv.textContent = 'No track links extracted.';
          statusDiv.className = 'info';
        }
      }
    } catch (error) {
      console.error("Error in Get Links:", error);
      linksArea.value = `Error: ${error.message}`;
      statusDiv.textContent = 'An error occurred.';
      statusDiv.className = 'error';
    }
  });

  copyLinksBtn.addEventListener('click', () => {
    if (extractedContent.length > 0) {
      navigator.clipboard.writeText(extractedContent.join('\n')).then(() => {
        statusDiv.textContent = 'Links copied to clipboard!';
        statusDiv.className = 'success';
        copyLinksBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyLinksBtn.textContent = 'Copy Links';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy links: ', err);
        statusDiv.textContent = 'Failed to copy.';
        statusDiv.className = 'error';
      });
    }
  });
});
