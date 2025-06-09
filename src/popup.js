document.addEventListener('DOMContentLoaded', async function () {
    const UI = {
        loginBtn: document.getElementById('loginBtn'),
        logoutBtn: document.getElementById('logoutBtn'),
        authStatusDiv: document.getElementById('authStatus'),
        getLinksBtn: document.getElementById('getLinksBtn'),
        copyLinksBtn: document.getElementById('copyLinksBtn'),
        linksArea: document.getElementById('linksArea'),
        statusDiv: document.getElementById('status'),

        linkOptionsDiv: document.getElementById('linkOptionsDiv'),
        linkTypeRadios: document.querySelectorAll('input[name="linkType"]'),
        albumLinkRadio: document.getElementById('radioAlbum'),
        albumLinkTypeLabelSpan: document.getElementById('albumLinkTypeLabelSpan'),
        trackSpecificOptionsContainer: document.getElementById('trackSpecificOptionsContainer'),
        allTracksRadio: document.getElementById('radioAllTracks'),
        firstTrackRadio: document.getElementById('radioFirstTrack'),
    };

    let extractedContent = [];
    let isLoggedIn = false;
    let currentChartType = 'not_rym';
    let currentTabId = null;

    // --- For Aborting Operations ---
    let currentOperationController = null;

    function getSelectedLinkType() {
        if (currentChartType === 'song' || currentChartType === 'not_rym' || currentChartType === 'unknown_rym') {
            return 'album';
        }
        for (const radio of UI.linkTypeRadios) {
            if (radio.checked) {
                return radio.value;
            }
        }
        return 'album';
    }

    function isTrackSpecificOptionEffectivelySelected() {
        if (currentChartType !== 'album') return false;
        const selected = getSelectedLinkType();
        return selected === 'allTracks' || selected === 'firstTrack';
    }

    async function determineChartType() {
        try {
            const [tab] = await browser.tabs.query({active: true, currentWindow: true});
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

    function updateLinkOptionsVisibilityAndLabels() {
        if (currentChartType === 'song') {
            UI.linkOptionsDiv.style.display = 'none';
        } else if (currentChartType === 'album') {
            UI.linkOptionsDiv.style.display = 'block';
            UI.albumLinkTypeLabelSpan.textContent = 'Album Links';
            UI.trackSpecificOptionsContainer.style.display = 'inline';
            UI.albumLinkRadio.disabled = false;
            UI.allTracksRadio.disabled = false;
            UI.firstTrackRadio.disabled = false;
        } else {
            UI.linkOptionsDiv.style.display = 'none';
        }
    }

    function setUiState(config) {
        const {
            state,
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
            case 'initial':
                UI.statusDiv.className = 'info';
                break;
            case 'loading':
                UI.statusDiv.className = 'info';
                break;
            case 'success':
                UI.statusDiv.className = 'success';
                break;
            case 'error':
                UI.statusDiv.className = 'error';
                break;
            case 'info':
                UI.statusDiv.className = 'info';
                break;
            default:
                UI.statusDiv.className = '';
        }
    }

    function updateDynamicUiElements() {
        const isTrackOptionSelectedAndRelevant = isTrackSpecificOptionEffectivelySelected();

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
            if (isTrackOptionSelectedAndRelevant) {
                UI.authStatusDiv.textContent += ' Login required to fetch track links.';
            }
        }

        let getLinksDisabled = false;
        let getLinksStatusMessage = 'Ready. Select link type and click "Get Links".';
        let linksAreaHint = '';

        if (currentChartType === 'song') {
            getLinksStatusMessage = 'Ready to get song links.';
            getLinksDisabled = false;
        } else if (currentChartType === 'not_rym') {
            getLinksDisabled = true;
            getLinksStatusMessage = 'Please navigate to an RYM page.';
            linksAreaHint = 'Not an RYM page.';
        } else if (currentChartType === 'unknown_rym') {
            getLinksDisabled = true;
            getLinksStatusMessage = 'This RYM page is not a chart. Navigate to a chart page.';
            linksAreaHint = 'Not an RYM chart page.';
        } else if (currentChartType === 'album' && isTrackOptionSelectedAndRelevant && !isLoggedIn) {
            getLinksDisabled = true;
            getLinksStatusMessage = 'Please log in to Spotify to fetch track links.';
            linksAreaHint = 'Login required for this option.';
        }

        if (currentOperationController) {
            getLinksDisabled = true;
        }

        UI.getLinksBtn.disabled = getLinksDisabled;

        const previousStatusClass = UI.statusDiv.className;
        if (getLinksDisabled && !currentOperationController) { // Only reset if not actively loading
            if (currentChartType === 'not_rym' || currentChartType === 'unknown_rym') {
                extractedContent = [];
            }
            setUiState({state: 'initial', statusMessage: getLinksStatusMessage, linksAreaMessage: linksAreaHint});
        } else if (!getLinksDisabled && !currentOperationController) { // Not disabled and not loading
            if (previousStatusClass !== 'success' && previousStatusClass !== 'loading') {
                setUiState({state: 'initial', statusMessage: getLinksStatusMessage});
            }
        }
    }

    async function checkLoginStatusAndInitUi() {
        UI.authStatusDiv.textContent = 'Checking login status...';
        UI.authStatusDiv.className = 'info';
        try {
            const status = await browser.runtime.sendMessage({action: "getUserAuthStatus"});
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
        updateDynamicUiElements();
    }

    async function initializePopup() {
        await determineChartType();
        updateLinkOptionsVisibilityAndLabels();
        await checkLoginStatusAndInitUi();
    }

    initializePopup();


    UI.loginBtn.addEventListener('click', async () => {
        UI.authStatusDiv.textContent = 'Attempting to log in...';
        UI.authStatusDiv.className = 'info';
        UI.loginBtn.disabled = true;
        try {
            const response = await browser.runtime.sendMessage({action: "initiateUserLogin"});
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
        updateDynamicUiElements();
    });

    UI.logoutBtn.addEventListener('click', async () => {
        if (currentOperationController) {
            console.log("Logout clicked, aborting current operation.");
            currentOperationController.abort();
            currentOperationController = null;
        }

        UI.authStatusDiv.textContent = 'Logging out...';
        UI.authStatusDiv.className = 'info';
        UI.logoutBtn.disabled = true;
        try {
            await browser.runtime.sendMessage({action: "userLogout"});
            isLoggedIn = false;
        } catch (e) {
            isLoggedIn = false;
            UI.authStatusDiv.textContent = `Logout error: ${e.message}`;
            UI.authStatusDiv.className = 'error';
        }
        UI.logoutBtn.disabled = false;
        extractedContent = [];
        updateDynamicUiElements();
        if (!isLoggedIn && UI.authStatusDiv.className !== 'error') {
            UI.authStatusDiv.textContent = 'Logged out.';
            UI.authStatusDiv.className = 'info';
        }
    });

    UI.getLinksBtn.addEventListener('click', async () => {
        if (currentOperationController) {
            console.log("Get Links clicked while an operation was in progress. Aborting previous.");
            currentOperationController.abort();
        }
        await handleGetLinks();
    });

    UI.copyLinksBtn.addEventListener('click', handleCopyLinks);

    UI.linkTypeRadios.forEach(radio => radio.addEventListener('change', () => {
        if (currentChartType === 'album') {
            if (currentOperationController) {
                console.log("Radio changed, aborting current operation.");
                currentOperationController.abort();
                currentOperationController = null;
                setUiState({state: 'initial', statusMessage: 'Operation cancelled. Select new option.'});
            }
            updateDynamicUiElements();
        }
    }));


    async function handleGetLinks() {
        // 1. Abort previous operation if any
        if (currentOperationController) {
            currentOperationController.abort();
        }
        currentOperationController = new AbortController();
        const signal = currentOperationController.signal;

        UI.getLinksBtn.disabled = true;
        setUiState({state: 'loading', statusMessage: 'Working...', linksAreaMessage: 'Extracting...'});
        extractedContent = [];

        const selectedLinkTypeValue = getSelectedLinkType();

        if (currentChartType === 'not_rym' || currentChartType === 'unknown_rym' || !currentTabId) {
            setUiState({state: 'error', statusMessage: 'Cannot get links: Not on a valid RYM chart page.'});
            if (currentOperationController && !currentOperationController.signal.aborted) {
                currentOperationController = null;
            }
            updateDynamicUiElements();
            return;
        }
        if (isTrackSpecificOptionEffectivelySelected() && !isLoggedIn) {
            setUiState({state: 'error', statusMessage: 'Cannot get links: Login required for this option.'});
            if (currentOperationController && !currentOperationController.signal.aborted) {
                currentOperationController = null;
            }
            updateDynamicUiElements();
            return;
        }

        try {
            if (selectedLinkTypeValue === 'album') {
                await processGeneralLinksExtraction(currentTabId, currentChartType, signal);
            } else {
                await processTrackLinksExtraction(currentTabId, selectedLinkTypeValue, signal);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Operation aborted by user.');
                setUiState({state: 'info', statusMessage: 'Operation cancelled.', linksAreaMessage: 'Cancelled.'});
            } else {
                console.error("Error in Get Links:", error);
                setUiState({state: 'error', statusMessage: `Error: ${error.message}`});
            }
        } finally {
            if (currentOperationController === signal.controller) { // Ensure it's the same controller
                currentOperationController = null;
            }
            updateDynamicUiElements();
        }
    }

    async function processGeneralLinksExtraction(tabId, chartTypeForContext, signal) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const response = await browser.tabs.sendMessage(tabId, {action: "extractSpotifyLinks"});

        if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); // Check after response

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
                    state: 'info',
                    statusMessage: `No Spotify ${linkTypeName} links found on this page.`,
                    linksAreaMessage: `No Spotify ${linkTypeName} links found here.`
                });
            }
        } else {
            const errorMessage = response?.error || `Could not extract ${linkTypeName} links from page.`;
            console.error(`Error extracting ${linkTypeName} links:`, response);
            setUiState({state: 'error', statusMessage: errorMessage});
        }
    }

    async function processTrackLinksExtraction(tabId, selectedLinkTypeValue, signal) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        const albumIdResponse = await browser.tabs.sendMessage(tabId, {action: "extractSpotifyAlbumIds"});
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        console.log("POPUP: Received albumIdResponse:", JSON.stringify(albumIdResponse, null, 2));

        if (!albumIdResponse || !albumIdResponse.albums || albumIdResponse.albums.length === 0) {
            const message = albumIdResponse?.error || 'No Spotify album IDs found on this page to fetch tracks for.';
            const linksAreaMsg = albumIdResponse?.error ? message : 'No albums found on RYM page to fetch tracks for.';
            setUiState({state: 'info', statusMessage: message, linksAreaMessage: linksAreaMsg});
            return;
        }

        const albums = albumIdResponse.albums;
        setUiState({
            state: 'loading',
            statusMessage: `Found ${albums.length} albums. Fetching tracks... (0/${albums.length})`,
        });

        for (let i = 0; i < albums.length; i++) {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

            const albumData = albums[i];
            setUiState({
                state: 'loading',
                statusMessage: `Fetching tracks for "${albumData.title}" (${i + 1}/${albums.length})...`,
            });

            try {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

                const trackResponse = await browser.runtime.sendMessage({
                    action: "getAlbumTracksFromSpotify",
                    albumId: albumData.id
                });

                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');


                if (trackResponse && trackResponse.needsLogin) {
                    isLoggedIn = false;
                    setUiState({
                        state: 'error',
                        statusMessage: 'Spotify session error. Please log in again.',
                        linksAreaMessage: 'Login required.'
                    });
                    return;
                }
                if (trackResponse && trackResponse.error) {
                    console.warn(`POPUP: BG error for album ${albumData.id} ("${albumData.title}"): ${trackResponse.error}`);
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
                if (e.name === 'AbortError') throw e;
                console.error(`POPUP: Error messaging background for album ${albumData.id} ("${albumData.title}"):`, e);
            }

            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            let TRACK_FETCH_DELAY_MS = 150; // Keep your delay
            await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(resolve, TRACK_FETCH_DELAY_MS);
                signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            });
        }

        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        if (extractedContent.length > 0) {
            const originalCount = extractedContent.length;
            extractedContent = [...new Set(extractedContent)];
            console.log(`POPUP: De-duplicated track links. Original: ${originalCount}, Unique: ${extractedContent.length}`);
        }

        if (extractedContent.length > 0) {
            setUiState({
                state: 'success',
                statusMessage: `Extracted ${extractedContent.length} unique track links.` // Updated message
            });
        } else {
            // Error states or "no tracks found" states are handled based on earlier logic or loop results
            if (!isLoggedIn && (selectedLinkTypeValue === 'allTracks' || selectedLinkTypeValue === 'firstTrack')) {
                setUiState({state: 'error', statusMessage: 'Login required to fetch tracks. Please log in.', linksAreaMessage: 'Login required.'});
            } else if (!signal.aborted) { // Only show "no tracks" if not aborted
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
                UI.statusDiv.className = 'success temporary-copy-status';
                UI.copyLinksBtn.textContent = 'Copied!';
                setTimeout(() => {
                    UI.copyLinksBtn.textContent = 'Copy Links';
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
