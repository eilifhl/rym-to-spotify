// src/popup.ts
import {
    ACTIONS,
    ExtractIdsResponse,
    ExtractLinksResponse,
    TrackResponse,
    AuthStatusResponse,
} from "./types";

// --- State & DOM ---
const UI = {
    loginBtn: document.getElementById("loginBtn") as HTMLButtonElement,
    logoutBtn: document.getElementById("logoutBtn") as HTMLButtonElement,
    authStatus: document.getElementById("authStatus") as HTMLDivElement,
    getLinksBtn: document.getElementById("getLinksBtn") as HTMLButtonElement,
    copyLinksBtn: document.getElementById("copyLinksBtn") as HTMLButtonElement,
    linksArea: document.getElementById("linksArea") as HTMLTextAreaElement,
    optionsDiv: document.getElementById("linkOptionsDiv") as HTMLDivElement,
    authSection: document.getElementById("authSection") as HTMLDivElement,
    radios: document.querySelectorAll<HTMLInputElement>(
        'input[name="linkType"]',
    ),
    status: document.getElementById("status") as HTMLDivElement,
};

let state = {
    isLoggedIn: false,
    tabId: null as number | null,
    chartType: "unknown" as "song" | "album" | "unsupported",
    abortController: null as AbortController | null,
};

// --- Helpers ---
function log(msg: string, type: "info" | "success" | "error" = "info") {
    UI.status.textContent = msg;
    UI.status.className = `status-text ${type}`;
}

function getMode() {
    return Array.from(UI.radios).find((r) => r.checked)?.value || "album";
}

// --- Main Initialization ---
async function init() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    const tab = tabs[0];
    state.tabId = tab?.id || null;

    if (tab?.url && tab.url.includes("rateyourmusic.com")) {
        if (tab.url.includes("/charts/")) {
            state.chartType = tab.url.includes("/song/") ? "song" : "album";
            UI.getLinksBtn.disabled = false;
            UI.getLinksBtn.textContent = "Get Links";
        } else {
            state.chartType = "unsupported";
            UI.getLinksBtn.disabled = true;
            UI.getLinksBtn.textContent = "Go to a Chart Page";
        }
    } else {
        state.chartType = "unsupported";
        UI.getLinksBtn.disabled = true;
        UI.getLinksBtn.textContent = "Not an RYM Page";
    }

    UI.optionsDiv.style.display =
        state.chartType === "album" ? "block" : "none";

    checkAuth();
}

async function checkAuth() {
    try {
        const res = (await browser.runtime.sendMessage({
            action: ACTIONS.GET_USER_AUTH_STATUS,
        })) as AuthStatusResponse;
        state.isLoggedIn = !!res?.isLoggedIn;
    } catch (e) {
        console.warn(
            "Auth check failed (background script might be sleeping):",
            e,
        );
        state.isLoggedIn = false;
    }
    updateAuthUI();
}

function updateAuthUI() {
    UI.loginBtn.style.display = state.isLoggedIn ? "none" : "inline-block";
    UI.logoutBtn.style.display = state.isLoggedIn ? "inline-block" : "none";
    UI.authStatus.textContent = state.isLoggedIn ? "Connected" : "Disconnected";
    UI.authStatus.className = `status-text ${state.isLoggedIn ? "success" : "info"}`;

    const indicator = document.getElementById("auth-indicator");
    if (indicator)
        indicator.className = `status-dot ${state.isLoggedIn ? "connected" : "disconnected"}`;
}

// --- Action Logic ---
async function onGetLinks() {
    // Prevent double clicks
    if (UI.getLinksBtn.disabled) return;

    UI.linksArea.value = "";
    UI.copyLinksBtn.disabled = true;

    if (state.abortController) state.abortController.abort();
    state.abortController = new AbortController();
    const signal = state.abortController.signal;

    UI.getLinksBtn.disabled = true;
    log("Reading page...", "info");

    try {
        const mode = getMode();
        let links: string[] = [];

        if (state.chartType === "song" || mode === "album") {
            const res = (await browser.tabs.sendMessage(state.tabId!, {
                action: ACTIONS.EXTRACT_LINKS,
            })) as ExtractLinksResponse;
            if (res.links) links = res.links;
        } else {
            if (!state.isLoggedIn)
                throw new Error("Please log in to extract tracks.");

            const idRes = (await browser.tabs.sendMessage(state.tabId!, {
                action: ACTIONS.EXTRACT_IDS,
            })) as ExtractIdsResponse;
            if (!idRes.albums?.length)
                throw new Error("No albums found on page.");

            log(
                `Found ${idRes.albums.length} albums. Fetching tracks...`,
                "info",
            );

            for (let i = 0; i < idRes.albums.length; i++) {
                if (signal.aborted) throw new Error("Aborted");

                const album = idRes.albums[i];
                log(
                    `Fetching ${i + 1}/${idRes.albums.length}: ${album.title.substring(0, 20)}...`,
                );

                const trackRes = (await browser.runtime.sendMessage({
                    action: ACTIONS.GET_ALBUM_TRACKS,
                    albumId: album.id,
                })) as TrackResponse;

                if (trackRes.needsLogin) {
                    state.isLoggedIn = false;
                    updateAuthUI();
                    throw new Error("Spotify Login Expired");
                }

                if (trackRes.tracks?.length) {
                    if (mode === "firstTrack") links.push(trackRes.tracks[0]);
                    else links.push(...trackRes.tracks);
                }

                await new Promise((r) => setTimeout(r, 100));
            }
        }

        if (signal.aborted) return;

        const unique = [...new Set(links)];
        if (unique.length === 0) {
            log("No Spotify links found.", "error");
        } else {
            UI.linksArea.value = unique.join("\n");
            UI.copyLinksBtn.disabled = false;
            log(`Success! Found ${unique.length} links.`, "success");
        }
    } catch (e: any) {
        if (e.message !== "Aborted") {
            log(e.message || "Error extracting links", "error");
            console.error(e);
        }
    } finally {
        if (!signal.aborted) UI.getLinksBtn.disabled = false;
        state.abortController = null;
    }
}

// --- Event Listeners ---
UI.getLinksBtn.onclick = onGetLinks;

UI.copyLinksBtn.onclick = () => {
    navigator.clipboard.writeText(UI.linksArea.value);
    UI.copyLinksBtn.textContent = "Copied!";
    setTimeout(() => (UI.copyLinksBtn.textContent = "Copy to Clipboard"), 2000);
};

UI.loginBtn.onclick = async () => {
    UI.authStatus.textContent = "Opening Spotify...";
    await browser.runtime.sendMessage({ action: ACTIONS.INITIATE_USER_LOGIN });
    checkAuth();
};

UI.logoutBtn.onclick = async () => {
    await browser.runtime.sendMessage({ action: ACTIONS.USER_LOGOUT });
    checkAuth();
};

init();
