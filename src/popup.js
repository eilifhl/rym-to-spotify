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
  };

  let extractedContent = [];
  let isLoggedIn = false;

  function getSelectedLinkType() {
    for (const radio of UI.linkTypeRadios) {
      if (radio.checked) {
        return radio.value;
      }
    }
    return 'album'; 
  }

  function updateUiBasedOnLoginAndType() {
    const selectedType = getSelectedLinkType();
    const needsLoginForSelectedType = selectedType === 'allTracks' || selectedType === 'firstTrack';

    if (isLoggedIn) {
      UI.loginBtn.style.display = 'none';
      UI.logoutBtn.style.display = 'block';
      UI.authStatusDiv.textContent = 'Logged in to Spotify.';
      UI.authStatusDiv.className = 'success';
      UI.getLinksBtn.disabled = false; 
    } else {
      UI.loginBtn.style.display = 'block';
      UI.logoutBtn.style.display = 'none';
      UI.authStatusDiv.textContent = 'Not logged in.';
      UI.authStatusDiv.className = 'info';
      if (needsLoginForSelectedType) {
        UI.authStatusDiv.textContent += ' Login required to fetch track links.';
        UI.getLinksBtn.disabled = true;
      } else {
        UI.getLinksBtn.disabled = false; 
      }
    }
    if (!UI.getLinksBtn.disabled && UI.statusDiv.textContent.includes('Login required')) {
      setUiState({ state: 'initial', statusMessage: 'Ready. Select link type and click "Get Links".'});
    } else if (UI.getLinksBtn.disabled && needsLoginForSelectedType) {
      setUiState({ state: 'initial', statusMessage: 'Please log in to fetch track links.'});
    }
  }

  function setUiState(config) {
    const {
      state,
      statusMessage = '',
      linksAreaMessage = '',
      disableGetLinksBtnOverride = null, 
    } = config;

    UI.statusDiv.textContent = statusMessage;

    // Button disabling logic
    const selectedType = getSelectedLinkType();
    const needsLoginForSelectedType = selectedType === 'allTracks' || selectedType === 'firstTrack';

    if (disableGetLinksBtnOverride !== null) {
      UI.getLinksBtn.disabled = disableGetLinksBtnOverride;
    } else {
      UI.getLinksBtn.disabled = (needsLoginForSelectedType && !isLoggedIn);
    }

    UI.copyLinksBtn.disabled = !(state === 'success' && extractedContent.length > 0);

    let currentLinksAreaMessage = linksAreaMessage || statusMessage;

    switch (state) {
      case 'initial':
        UI.linksArea.value = UI.linksArea.placeholder;
        UI.statusDiv.className = 'info';
        if (needsLoginForSelectedType && !isLoggedIn && !statusMessage) {
          UI.statusDiv.textContent = 'Please log in to fetch track links.';
        }
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

  async function checkLoginStatusAndUpdateUi() {
    UI.authStatusDiv.textContent = 'Checking login status...';
    UI.authStatusDiv.className = 'info';
    try {
      const status = await browser.runtime.sendMessage({ action: "getUserAuthStatus" });
      if (status && status.error) {
        isLoggedIn = false;
        UI.authStatusDiv.textContent = `Auth status error: ${status.error}`;
        UI.authStatusDiv.className = 'error';
      } else {
        isLoggedIn = status.isLoggedIn;
      }
    } catch (e) {
      console.warn("Could not check user auth status on load", e);
      isLoggedIn = false;
      UI.authStatusDiv.textContent = "Could not check login status.";
      UI.authStatusDiv.className = 'error';
    }
    updateUiBasedOnLoginAndType();
    const selectedType = getSelectedLinkType();
    const needsLogin = selectedType === 'allTracks' || selectedType === 'firstTrack';
    if (!isLoggedIn && needsLogin) {
      setUiState({ state: 'initial', statusMessage: "Please log in to Spotify to fetch track links." });
    } else {
      setUiState({ state: 'initial', statusMessage: 'Ready. Select link type and click "Get Links".' });
    }
  }

  // --- Initial Setup ---
  await checkLoginStatusAndUpdateUi();

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
        isLoggedIn = true;
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
    updateUiBasedOnLoginAndType();
    if (isLoggedIn) { 
      setUiState({ state: 'initial', statusMessage: 'Ready. Select link type and click "Get Links".'});
    }
  });

  UI.logoutBtn.addEventListener('click', async () => {
    UI.authStatusDiv.textContent = 'Logging out...';
    UI.authStatusDiv.className = 'info';
    UI.logoutBtn.disabled = true;
    try {
      const response = await browser.runtime.sendMessage({ action: "userLogout" });
      isLoggedIn = false; 
      if (response && response.error) {
        UI.authStatusDiv.textContent = `Logout error: ${response.error}`;
        UI.authStatusDiv.className = 'error';
      }
    } catch(e) {
      isLoggedIn = false; 
      UI.authStatusDiv.textContent = `Logout error: ${e.message}`;
      UI.authStatusDiv.className = 'error';
    }
    UI.logoutBtn.disabled = false;
    updateUiBasedOnLoginAndType();
    extractedContent = []; 
    setUiState({ state: 'initial', statusMessage: "Logged out. Log in to fetch track links." });
  });

  UI.getLinksBtn.addEventListener('click', handleGetLinks);
  UI.copyLinksBtn.addEventListener('click', handleCopyLinks);

  UI.linkTypeRadios.forEach(radio => radio.addEventListener('change', () => {
    updateUiBasedOnLoginAndType();
    const selectedType = getSelectedLinkType();
    const needsLogin = selectedType === 'allTracks' || selectedType === 'firstTrack';
    if (!needsLogin || isLoggedIn) {
      if (UI.statusDiv.textContent.includes("Please log in")) {
        setUiState({ state: 'initial', statusMessage: 'Ready. Select link type and click "Get Links".' });
      }
    } else if (needsLogin && !isLoggedIn) {
      setUiState({ state: 'initial', statusMessage: "Please log in to Spotify to fetch track links." });
    }
  }));


  async function handleGetLinks() {
    setUiState({ state: 'loading', statusMessage: 'Working...', disableGetLinksBtnOverride: true });
    extractedContent = [];

    const selectedLinkType = getSelectedLinkType();
    const needsLoginForSelectedType = selectedLinkType === 'allTracks' || selectedLinkType === 'firstTrack';

    if (needsLoginForSelectedType && !isLoggedIn) {
      setUiState({
        state: 'error',
        statusMessage: 'Please log in with Spotify to fetch track links.',
        linksAreaMessage: 'Login required.'
      });
      updateUiBasedOnLoginAndType();
      return;
    }

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
    } finally {
      if (UI.statusDiv.className !== 'loading') { 
        const currentStatus = UI.statusDiv.textContent; 
        const currentState = UI.statusDiv.className; 
        setUiState({state: currentState, statusMessage: currentStatus, disableGetLinksBtnOverride: null});
      }
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
    setUiState({
      state: 'loading',
      statusMessage: `Found ${albums.length} albums. Fetching tracks...`,
      disableGetLinksBtnOverride: true
    });

    for (let i = 0; i < albums.length; i++) {
      const albumData = albums[i];
      setUiState({
        state: 'loading',
        statusMessage: `Fetching tracks for "${albumData.title}" (${i + 1}/${albums.length})...`,
        disableGetLinksBtnOverride: true,
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
          updateUiBasedOnLoginAndType(); 
          return; 
        }
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
      let TRACK_FETCH_DELAY_MS = 150; // Keep politeness delay
      await new Promise(resolve => setTimeout(resolve, TRACK_FETCH_DELAY_MS));
    }

    if (extractedContent.length > 0) {
      setUiState({
        state: 'success',
        statusMessage: `Extracted ${extractedContent.length} track links.`
      });
    } else {
      if (!isLoggedIn && (selectedLinkType === 'allTracks' || selectedLinkType === 'firstTrack')) {
        setUiState({ state: 'error', statusMessage: 'Login required to fetch tracks. Please log in.' });
      } else {
        setUiState({
          state: 'info',
          statusMessage: 'No tracks found for the albums on this page, or errors occurred during fetch.'
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
        UI.statusDiv.className = 'success temporary-copy-status';
        UI.copyLinksBtn.textContent = 'Copied!';

        setTimeout(() => {
          UI.copyLinksBtn.textContent = 'Copy Links';
          UI.statusDiv.textContent = originalStatus;
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
