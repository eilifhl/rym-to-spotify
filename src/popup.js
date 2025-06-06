document.addEventListener('DOMContentLoaded', async function() {
  // --- UI Elements ---
  const UI = {
    getLinksBtn: document.getElementById('getLinksBtn'),
    copyLinksBtn: document.getElementById('copyLinksBtn'),
    linksArea: document.getElementById('linksArea'),
    statusDiv: document.getElementById('status'),
    linkTypeRadios: document.querySelectorAll('input[name="linkType"]'),
  };

  let extractedContent = []; // Stores the latest extracted links/data

  // --- UI State Management ---
  /**
   * Updates the UI elements based on the current state.
   * @param {object} config - Configuration for the UI state.
   * @param {'initial'|'loading'|'success'|'error'|'info'} config.state - The state to set.
   * @param {string} [config.statusMessage=''] - Message for the status div.
   * @param {string} [config.linksAreaMessage=''] - Message for the links textarea (if different from status).
   * @param {boolean} [config.disableGetLinksBtn=false] - Whether to disable the "Get Links" button.
   */
  function setUiState(config) {
    const {
      state,
      statusMessage = '',
      linksAreaMessage = '',
      disableGetLinksBtn = false,
    } = config;

    UI.statusDiv.textContent = statusMessage;
    UI.getLinksBtn.disabled = disableGetLinksBtn;
    // Copy button is enabled only if there's content and not in loading/error/info states
    UI.copyLinksBtn.disabled = !(state === 'success' && extractedContent.length > 0);


    let currentLinksAreaMessage = linksAreaMessage || statusMessage;

    switch (state) {
      case 'initial':
        UI.linksArea.value = UI.linksArea.placeholder;
        UI.statusDiv.className = 'info'; // Initial messages are usually informational
        break;
      case 'loading':
        UI.linksArea.value = linksAreaMessage || 'Extracting...';
        UI.statusDiv.className = 'info';
        break;
      case 'success':
        UI.linksArea.value = extractedContent.join('\n');
        UI.statusDiv.className = 'success';
        break;
      case 'error':
        UI.linksArea.value = currentLinksAreaMessage;
        UI.statusDiv.className = 'error';
        break;
      case 'info':
        UI.linksArea.value = currentLinksAreaMessage;
        UI.statusDiv.className = 'info';
        break;
      default:
        UI.statusDiv.className = '';
    }
  }

  // --- Initial Setup ---
  try {
    const tokenStatus = await browser.runtime.sendMessage({ action: "getAppTokenStatus" });
    if (tokenStatus && tokenStatus.error) {
        setUiState({ state: 'initial', statusMessage: `Token status check error: ${tokenStatus.error}`});
    } else if (tokenStatus && !tokenStatus.hasToken) {
      setUiState({ state: 'initial', statusMessage: "Spotify app token might need to be fetched. Click 'Get Links'." });
    } else {
      setUiState({ state: 'initial', statusMessage: 'Ready. Select link type and click "Get Links".' });
    }
  } catch (e) {
    console.warn("Could not check app token status on load", e);
    setUiState({ state: 'initial', statusMessage: "Could not check app token status on load." });
  }

  // --- Event Listeners ---
  UI.getLinksBtn.addEventListener('click', handleGetLinks);
  UI.copyLinksBtn.addEventListener('click', handleCopyLinks);

  // --- Core Logic Functions ---
  function getSelectedLinkType() {
    for (const radio of UI.linkTypeRadios) {
      if (radio.checked) {
        return radio.value;
      }
    }
    return 'album'; // Default
  }

  async function handleGetLinks() {
    setUiState({ state: 'loading', statusMessage: 'Working...', disableGetLinksBtn: true });
    extractedContent = []; // Reset

    const selectedLinkType = getSelectedLinkType();

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes("rateyourmusic.com/charts/")) {
        setUiState({
          state: 'error',
          statusMessage: 'Please navigate to an RYM chart page.',
          linksAreaMessage: 'Not an RYM chart page.'
        });
        return;
      }

      if (selectedLinkType === 'album') {
        await processAlbumLinksExtraction(tab.id);
      } else {
        await processTrackLinksExtraction(tab.id, selectedLinkType);
      }
    } catch (error) {
      console.error("Error in Get Links:", error);
      setUiState({ state: 'error', statusMessage: `Error: ${error.message}` });
    }
  }

  async function processAlbumLinksExtraction(tabId) {
    const response = await browser.tabs.sendMessage(tabId, { action: "extractSpotifyLinks" });
    if (response && response.links) {
      extractedContent = response.links;
      if (extractedContent.length > 0) {
        setUiState({
          state: 'success',
          statusMessage: `Found ${extractedContent.length} Spotify album links.`
        });
      } else {
        setUiState({
          state: 'info',
          statusMessage: 'No Spotify album links found on this page.'
        });
      }
    } else {
      const errorMessage = response?.error || "Could not extract album links from page.";
      console.error("Error extracting album links:", response);
      setUiState({ state: 'error', statusMessage: errorMessage });
    }
  }

  async function processTrackLinksExtraction(tabId, selectedLinkType) {
    const albumIdResponse = await browser.tabs.sendMessage(tabId, { action: "extractSpotifyAlbumIds" });
    console.log("POPUP: Received albumIdResponse:", JSON.stringify(albumIdResponse, null, 2));

    if (!albumIdResponse || !albumIdResponse.albums || albumIdResponse.albums.length === 0) {
      const message = albumIdResponse?.error || 'No Spotify album IDs found on this page to fetch tracks for.';
      const linksAreaMsg = albumIdResponse?.error ? message : 'No albums found on RYM page to fetch tracks for.';
      setUiState({ state: 'info', statusMessage: message, linksAreaMessage: linksAreaMsg });
      return;
    }

    const albums = albumIdResponse.albums;
    setUiState({ // Update to loading state, but with more info
        state: 'loading',
        statusMessage: `Found ${albums.length} albums. Fetching tracks...`,
        disableGetLinksBtn: true
    });

    for (let i = 0; i < albums.length; i++) {
      const albumData = albums[i];
      setUiState({
          progressMessage: `Fetching tracks for "${albumData.title}" (${i + 1}/${albums.length})...`
      });

      try {
        const trackResponse = await browser.runtime.sendMessage({
          action: "getAlbumTracksFromSpotify",
          albumId: albumData.id
        });
        console.log(`POPUP: Raw trackResponse for ${albumData.id} ("${albumData.title}"):`, trackResponse);

        if (trackResponse && trackResponse.error) {
          console.warn(`POPUP: BG error for album ${albumData.id} ("${albumData.title}"): ${trackResponse.error}`);
        } else if (trackResponse && Array.isArray(trackResponse.tracks) && trackResponse.tracks.length > 0) {
          if (selectedLinkType === 'allTracks') {
            extractedContent.push(...trackResponse.tracks);
          } else if (selectedLinkType === 'firstTrack' && trackResponse.tracks[0]) {
            extractedContent.push(trackResponse.tracks[0]);
          }
        } else {
           console.warn(`POPUP: No tracks or unexpected response for album ${albumData.id} ("${albumData.title}"):`, trackResponse);
        }
      } catch (e) {
         console.error(`POPUP: Error messaging background for album ${albumData.id} ("${albumData.title}"):`, e);
      }
      await new Promise(resolve => setTimeout(resolve, TRACK_FETCH_DELAY_MS)); // Politeness delay
    }

    if (extractedContent.length > 0) {
      setUiState({
        state: 'success',
        statusMessage: `Extracted ${extractedContent.length} track links.`
      });
    } else {
      setUiState({
        state: 'info',
        statusMessage: 'No tracks found for the albums on this page, or errors occurred.'
      });
    }
  }

  function handleCopyLinks() {
    if (extractedContent.length > 0) {
      navigator.clipboard.writeText(extractedContent.join('\n')).then(() => {
        const originalStatus = UI.statusDiv.textContent;
        const originalClassName = UI.statusDiv.className;

        UI.statusDiv.textContent = 'Links copied to clipboard!';
        UI.statusDiv.className = 'success temporary-copy-status'; // Can be used for temp styling
        UI.copyLinksBtn.textContent = 'Copied!';
        
        setTimeout(() => {
          UI.copyLinksBtn.textContent = 'Copy Links';
          UI.statusDiv.textContent = originalStatus; // Restore previous status
          UI.statusDiv.className = originalClassName;
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy links: ', err);
        const originalStatus = UI.statusDiv.textContent;
        const originalClassName = UI.statusDiv.className;

        UI.statusDiv.textContent = 'Failed to copy.';
        UI.statusDiv.className = 'error temporary-copy-status';
        setTimeout(() => {
          UI.statusDiv.textContent = originalStatus;
          UI.statusDiv.className = originalClassName;
        }, 2000);
      });
    }
  }
});
