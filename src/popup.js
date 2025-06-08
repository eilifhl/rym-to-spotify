document.addEventListener('DOMContentLoaded', async function() {
  const UI = {
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    authStatusDiv: document.getElementById('authStatus'),
    getLinksBtn: document.getElementById('getLinksBtn'),
    copyLinksBtn: document.getElementById('copyLinksBtn'),
    linksArea: document.getElementById('linksArea'),
    statusDiv: document.getElementById('status'),
    linkTypeRadios: document.querySelectorAll('input[name="linkType"]'),
    albumLinkRadio: document.getElementById('radioAlbum'),
    allTracksRadio: document.getElementById('radioAllTracks'),
    firstTrackRadio: document.getElementById('radioFirstTrack'),
    albumLinkTypeLabelSpan: document.getElementById('albumLinkTypeLabelSpan'),
  };

  let extractedContent = [];
  let isLoggedIn = false;
  let currentChartType = 'not_rym'; // 'album', 'song', 'unknown_rym', 'not_rym'
  let currentTabId = null;
  // let currentTabUrl = null; // Not strictly needed globally if currentTabId and currentChartType are enough

  function getSelectedLinkType() {
    for (const radio of UI.linkTypeRadios) {
      if (radio.checked) {
        return radio.value;
      }
    }
    return 'album';
  }

  function isTrackSpecificOptionSelected() {
    const selected = getSelectedLinkType();
    return selected === 'allTracks' || selected === 'firstTrack';
  }

  async function determineChartType() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        currentTabId = tab.id;
        if (tab.url.includes("rateyourmusic.com/charts/")) {
          if (tab.url.includes("/song/")) {
            currentChartType = 'song';
          } else {
            currentChartType = 'album';
          }
        } else if (tab.url.includes("rateyourmusic.com/")) {
          currentChartType = 'unknown_rym';
        } else {
          currentChartType = 'not_rym';
        }
      } else {
        currentChartType = 'not_rym';
        currentTabId = null;
      }
    } catch (e) {
      console.error("Error determining chart type:", e);
      currentChartType = 'not_rym';
      currentTabId = null;
    }
  }

  function updateRadioButtonsBasedOnChartType() {
    UI.albumLinkTypeLabelSpan.textContent = 'Album Links';
    UI.allTracksRadio.disabled = false;
    UI.firstTrackRadio.disabled = false;
    UI.albumLinkRadio.disabled = false;

    if (currentChartType === 'song') {
      UI.albumLinkTypeLabelSpan.textContent = 'Song Links';
      UI.allTracksRadio.disabled = true;
      UI.firstTrackRadio.disabled = true;

      if (UI.allTracksRadio.checked || UI.firstTrackRadio.checked) {
        UI.albumLinkRadio.checked = true;
      }
    }
     else { // 'not_rym' or 'unknown_rym'
      UI.albumLinkTypeLabelSpan.textContent = 'Links'; // Generic
      UI.albumLinkRadio.disabled = true;
      UI.allTracksRadio.disabled = true;
      UI.firstTrackRadio.disabled = true;
    }
  }

  function setUiState(config) {
    const {
      state, // 'initial', 'loading', 'success', 'error', 'info'
      statusMessage = '',
      linksAreaMessage = '',
    } = config;

    UI.statusDiv.textContent = statusMessage;
    UI.linksArea.value = linksAreaMessage || (state === 'initial' ? UI.linksArea.placeholder : statusMessage);

    if (state === 'initial' && !linksAreaMessage) {
      UI.linksArea.value = UI.linksArea.placeholder;
    }

    UI.copyLinksBtn.disabled = !(state === 'success' && extractedContent.length > 0);

    switch (state) {
      case 'initial': UI.statusDiv.className = 'info'; break;
      case 'loading': UI.statusDiv.className = 'info'; break;
      case 'success': UI.statusDiv.className = 'success'; break;
      case 'error': UI.statusDiv.className = 'error'; break;
      case 'info': UI.statusDiv.className = 'info'; break; // For "No links found" etc.
      default: UI.statusDiv.className = '';
    }
  }

  function updateDynamicUiElements() {
    const selectedLinkTypeValue = getSelectedLinkType();
    const isTrackOption = isTrackSpecificOptionSelected();

    // 1. Login/Logout buttons and Auth Status
    if (isLoggedIn) {
      UI.loginBtn.style.display = 'none';
      UI.logoutBtn.style.display = 'block';
      UI.authStatusDiv.textContent = 'Logged in to Spotify.';
      UI.authStatusDiv.className = 'success';
    } else {
      UI.loginBtn.style.display = 'block';
      UI.logoutBtn.style.display = 'none';
      UI.authStatusDiv.textContent = 'Not logged in.';
      UI.authStatusDiv.className = 'info';
      if (isTrackOption && (currentChartType === 'album')) { // Only show login hint if track option is viable
        UI.authStatusDiv.textContent += ' Login required to fetch track links.';
      }
    }

    // 2. "Get Links" button state and related status message
    let getLinksDisabled = false;
    let getLinksStatusMessage = 'Ready. Select link type and click "Get Links".'; // Default ready message
    let linksAreaHint = ''; // Specific message for linksArea when disabled

    if (currentChartType === 'not_rym') {
      getLinksDisabled = true;
      getLinksStatusMessage = 'Please navigate to an RYM page.';
      linksAreaHint = 'Not an RYM page.';
    } else if (currentChartType === 'unknown_rym') {
      getLinksDisabled = true;
      getLinksStatusMessage = 'This RYM page is not a chart. Navigate to a chart page.';
      linksAreaHint = 'Not an RYM chart page.';
    } else if (currentChartType === 'song' && isTrackOption) {
      getLinksDisabled = true;
      getLinksStatusMessage = 'Track-specific options are not available for song charts.';
      linksAreaHint = 'This option is not available for song charts.';
    } else if (isTrackOption && !isLoggedIn) { // Applies only to album charts due to previous condition
      getLinksDisabled = true;
      getLinksStatusMessage = 'Please log in to Spotify to fetch track links.';
      linksAreaHint = 'Login required for this option.';
    }

    UI.getLinksBtn.disabled = getLinksDisabled;

    // 3. Status Div and Links Area based on current state
    const previousStatusClass = UI.statusDiv.className;

    if (getLinksDisabled) {
      extractedContent = []; // Clear data if options made it invalid
      setUiState({ state: 'initial', statusMessage: getLinksStatusMessage, linksAreaMessage: linksAreaHint });
    } else { // getLinksBtn is enabled
      if (previousStatusClass !== 'success') {
        // Not currently showing successful results, so reset to "Ready".
        setUiState({ state: 'initial', statusMessage: getLinksStatusMessage });
      }
      // If previousStatusClass WAS 'success', results are shown, keep them.
      // The getLinksStatusMessage is "Ready...", which is appropriate.
    }
  }

  async function checkLoginStatusAndInitUi() {
    UI.authStatusDiv.textContent = 'Checking login status...';
    UI.authStatusDiv.className = 'info';
    try {
      const status = await browser.runtime.sendMessage({ action: "getUserAuthStatus" });
      isLoggedIn = status && !status.error && status.isLoggedIn;
      if (status && status.error) {
        UI.authStatusDiv.textContent = `Auth status error: ${status.error}`;
        UI.authStatusDiv.className = 'error';
      }
    } catch (e) {
      console.warn("Could not check user auth status on load", e);
      isLoggedIn = false;
      UI.authStatusDiv.textContent = "Could not check login status.";
      UI.authStatusDiv.className = 'error';
    }
    updateDynamicUiElements(); // Update based on login status and other factors
  }

  // --- Initial Setup ---
  async function initializePopup() {
    await determineChartType();
    updateRadioButtonsBasedOnChartType(); // Update radio labels/disabled state first
    await checkLoginStatusAndInitUi();    // Then check login and update the rest
  }
  initializePopup();


  // --- Event Listeners ---
  UI.loginBtn.addEventListener('click', async () => {
    UI.authStatusDiv.textContent = 'Attempting to log in...';
    UI.authStatusDiv.className = 'info';
    UI.loginBtn.disabled = true;
    try {
      const response = await browser.runtime.sendMessage({ action: "initiateUserLogin" });
      if (response && response.error) {
        isLoggedIn = false;
        UI.authStatusDiv.textContent = `Login failed: ${response.error}`;
        UI.authStatusDiv.className = 'error';
      } else if (response && response.success) {
        isLoggedIn = true; // Successfully logged in
      } else {
        isLoggedIn = false;
        UI.authStatusDiv.textContent = 'Login attempt finished with unclear result.';
        UI.authStatusDiv.className = 'info';
      }
    } catch (e) {
      isLoggedIn = false;
      UI.authStatusDiv.textContent = `Login error: ${e.message}`;
      UI.authStatusDiv.className = 'error';
    }
    UI.loginBtn.disabled = false;
    updateDynamicUiElements(); // Update all relevant UI parts
  });

  UI.logoutBtn.addEventListener('click', async () => {
    UI.authStatusDiv.textContent = 'Logging out...';
    UI.authStatusDiv.className = 'info';
    UI.logoutBtn.disabled = true;
    try {
      await browser.runtime.sendMessage({ action: "userLogout" });
      isLoggedIn = false;
    } catch(e) {
      isLoggedIn = false;
      UI.authStatusDiv.textContent = `Logout error: ${e.message}`;
      UI.authStatusDiv.className = 'error';
    }
    UI.logoutBtn.disabled = false;
    extractedContent = [];
    updateDynamicUiElements(); // Update all relevant UI parts
    // Explicitly set logged out message if not already handled by updateDynamicUiElements
    if (!isLoggedIn && UI.authStatusDiv.className !== 'error') {
      UI.authStatusDiv.textContent = 'Logged out.';
      UI.authStatusDiv.className = 'info';
    }
  });

  UI.getLinksBtn.addEventListener('click', handleGetLinks);
  UI.copyLinksBtn.addEventListener('click', handleCopyLinks);

  UI.linkTypeRadios.forEach(radio => radio.addEventListener('change', () => {
    // When radio changes, chart type and login status are the same,
    // but the selected option changes, so update UI accordingly.
    updateDynamicUiElements();
  }));


  async function handleGetLinks() {
    UI.getLinksBtn.disabled = true; // Disable during operation
    setUiState({ state: 'loading', statusMessage: 'Working...', linksAreaMessage: 'Extracting...' });
    extractedContent = [];

    const selectedLinkTypeValue = getSelectedLinkType();

    // Perform safety checks again, though UI should prevent this
    if (currentChartType === 'not_rym' || currentChartType === 'unknown_rym' || !currentTabId) {
      setUiState({ state: 'error', statusMessage: 'Cannot get links: Not on a valid RYM chart page.'});
      updateDynamicUiElements(); return;
    }
    if (currentChartType === 'song' && isTrackSpecificOptionSelected()) {
      setUiState({ state: 'error', statusMessage: 'Cannot get links: Invalid option for song chart.'});
      updateDynamicUiElements(); return;
    }
    if (isTrackSpecificOptionSelected() && !isLoggedIn) {
      setUiState({ state: 'error', statusMessage: 'Cannot get links: Login required for this option.'});
      updateDynamicUiElements(); return;
    }

    try {
      if (selectedLinkTypeValue === 'album') { // Covers "Album Links" and "Song Links"
        await processGeneralLinksExtraction(currentTabId, currentChartType);
      } else { // 'allTracks' or 'firstTrack' (only for 'album' chart type)
        await processTrackLinksExtraction(currentTabId, selectedLinkTypeValue);
      }
    } catch (error) {
      console.error("Error in Get Links:", error);
      setUiState({ state: 'error', statusMessage: `Error: ${error.message}` });
    } finally {
      // Refresh UI state, which will re-enable GetLinksBtn if appropriate
      // and preserve success/error messages if they were set by processing functions.
      updateDynamicUiElements();
    }
  }

  // Renamed from processAlbumLinksExtraction
  async function processGeneralLinksExtraction(tabId, chartTypeForContext) {
    const response = await browser.tabs.sendMessage(tabId, { action: "extractSpotifyLinks" });
    const linkTypeName = chartTypeForContext === 'song' ? 'song' : 'album';

    if (response && response.links) {
      extractedContent = response.links;
      if (extractedContent.length > 0) {
        setUiState({
          state: 'success',
          statusMessage: `Found ${extractedContent.length} Spotify ${linkTypeName} links.`
        });
      } else {
        setUiState({
          state: 'info', // Using 'info' for "not found" type messages
          statusMessage: `No Spotify ${linkTypeName} links found on this page.`,
          linksAreaMessage: `No Spotify ${linkTypeName} links found here.`
        });
      }
    } else {
      const errorMessage = response?.error || `Could not extract ${linkTypeName} links from page.`;
      console.error(`Error extracting ${linkTypeName} links:`, response);
      setUiState({ state: 'error', statusMessage: errorMessage });
    }
  }

  async function processTrackLinksExtraction(tabId, selectedLinkTypeValue) {
    const albumIdResponse = await browser.tabs.sendMessage(tabId, { action: "extractSpotifyAlbumIds" });
    console.log("POPUP: Received albumIdResponse:", JSON.stringify(albumIdResponse, null, 2));

    if (!albumIdResponse || !albumIdResponse.albums || albumIdResponse.albums.length === 0) {
      const message = albumIdResponse?.error || 'No Spotify album IDs found on this page to fetch tracks for.';
      const linksAreaMsg = albumIdResponse?.error ? message : 'No albums found on RYM page to fetch tracks for.';
      setUiState({ state: 'info', statusMessage: message, linksAreaMessage: linksAreaMsg });
      return;
    }

    const albums = albumIdResponse.albums;
    UI.getLinksBtn.disabled = true; // Keep disabled during multi-step fetching
    setUiState({
      state: 'loading',
      statusMessage: `Found ${albums.length} albums. Fetching tracks... (0/${albums.length})`,
    });

    for (let i = 0; i < albums.length; i++) {
      const albumData = albums[i];
      // Update status for each album
      setUiState({
        state: 'loading',
        statusMessage: `Fetching tracks for "${albumData.title}" (${i + 1}/${albums.length})...`,
      });


      try {
        const trackResponse = await browser.runtime.sendMessage({
          action: "getAlbumTracksFromSpotify",
          albumId: albumData.id
        });

        if (trackResponse && trackResponse.needsLogin) {
          isLoggedIn = false;
          setUiState({
            state: 'error',
            statusMessage: 'Spotify session error. Please log in again.',
            linksAreaMessage: 'Login required.'
          });
          // updateDynamicUiElements() will be called in finally of handleGetLinks
          return;
        }
        if (trackResponse && trackResponse.error) {
          console.warn(`POPUP: BG error for album ${albumData.id} ("${albumData.title}"): ${trackResponse.error}`);
          // Optionally add to a list of errors to display, or just log
        } else if (trackResponse && Array.isArray(trackResponse.tracks) && trackResponse.tracks.length > 0) {
          if (selectedLinkTypeValue === 'allTracks') {
            extractedContent.push(...trackResponse.tracks);
          } else if (selectedLinkTypeValue === 'firstTrack' && trackResponse.tracks[0]) {
            extractedContent.push(trackResponse.tracks[0]);
          }
        } else {
          console.warn(`POPUP: No tracks or unexpected response for album ${albumData.id} ("${albumData.title}"):`, trackResponse);
        }
      } catch (e) {
        console.error(`POPUP: Error messaging background for album ${albumData.id} ("${albumData.title}"):`, e);
        // Potentially stop or show a partial error
      }
      let TRACK_FETCH_DELAY_MS = 150;
      await new Promise(resolve => setTimeout(resolve, TRACK_FETCH_DELAY_MS));
    }

    if (extractedContent.length > 0) {
      setUiState({
        state: 'success',
        statusMessage: `Extracted ${extractedContent.length} track links.`
      });
    } else {
      // Check if failure was due to login, though prior checks should catch this
      if (!isLoggedIn && (selectedLinkTypeValue === 'allTracks' || selectedLinkTypeValue === 'firstTrack')) {
        setUiState({ state: 'error', statusMessage: 'Login required to fetch tracks. Please log in.' });
      } else {
        setUiState({
          state: 'info',
          statusMessage: 'No tracks found for the albums on this page, or errors occurred during fetch.',
          linksAreaMessage: 'No track links found or errors occurred.'
        });
      }
    }
  }

  function handleCopyLinks() {
    if (extractedContent.length > 0) {
      navigator.clipboard.writeText(extractedContent.join('\n')).then(() => {
        const originalStatus = UI.statusDiv.textContent;
        const originalClassName = UI.statusDiv.className;

        UI.statusDiv.textContent = 'Links copied to clipboard!';
        UI.statusDiv.className = 'success temporary-copy-status'; // You might want a specific class for temporary
        UI.copyLinksBtn.textContent = 'Copied!';

        setTimeout(() => {
          UI.copyLinksBtn.textContent = 'Copy Links';
          // Restore previous status only if it wasn't overwritten by another user action
          if (UI.statusDiv.textContent === 'Links copied to clipboard!') {
            UI.statusDiv.textContent = originalStatus;
            UI.statusDiv.className = originalClassName;
          }
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy links: ', err);
        const originalStatus = UI.statusDiv.textContent;
        const originalClassName = UI.statusDiv.className;

        UI.statusDiv.textContent = 'Failed to copy.';
        UI.statusDiv.className = 'error temporary-copy-status';
        setTimeout(() => {
          if (UI.statusDiv.textContent === 'Failed to copy.') {
            UI.statusDiv.textContent = originalStatus;
            UI.statusDiv.className = originalClassName;
          }
        }, 2000);
      });
    }
  }
});
