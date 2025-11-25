import { Runtime } from "webextension-polyfill";
// REMOVE the import from './types' to prevent splitting
// import { ACTIONS, ExtractIdsResponse, ... } from "./types";

// --- COPY CONSTANTS HERE ---
const ACTIONS = {
  GET_ALBUM_TRACKS: "getAlbumTracksFromSpotify",
  GET_USER_AUTH_STATUS: "getUserAuthStatus",
  INITIATE_USER_LOGIN: "initiateUserLogin",
  USER_LOGOUT: "userLogout",
  EXTRACT_IDS: "extractSpotifyAlbumIds",
  EXTRACT_LINKS: "extractSpotifyLinks",
} as const;

// --- REDEFINE INTERFACES LOCALLY (Types don't affect the build output) ---
interface RymSpotifyData {
  spotify?: {
    [key: string]: {
      type: string;
      default?: boolean;
    };
  };
}

// ... (Keep the rest of your functions: parseDataLinks, getAlbumTitle, etc.) ...

function parseDataLinks(jsonStr: string | null): RymSpotifyData | null {
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    try {
      const txt = document.createElement("textarea");
      txt.innerHTML = jsonStr;
      return JSON.parse(txt.value);
    } catch {
      return null;
    }
  }
}

function getAlbumTitle(container: HTMLElement): string {
  const item = container.closest(".page_charts_section_charts_item");
  if (!item) return "Unknown Album";
  const titleEl =
    item.querySelector(
      ".page_charts_section_charts_item_title .ui_name_locale_original",
    ) || item.querySelector(".page_charts_section_charts_item_title > a");
  return titleEl?.textContent?.trim() || "Unknown Album";
}

function extractSpotifyAlbumIds() {
  const uniqueAlbums = new Map<string, string>();
  const containers = document.querySelectorAll<HTMLElement>(
    'div[id^="media_link_button_container_"]',
  );

  containers.forEach((container) => {
    const rawJson = container.getAttribute("data-links");
    const data = parseDataLinks(rawJson);
    if (!data?.spotify) return;

    let selectedId: string | null = null;
    for (const [id, entry] of Object.entries(data.spotify)) {
      if (entry.type === "album") {
        if (entry.default) {
          selectedId = id;
          break;
        }
        selectedId = selectedId || id;
      }
    }
    if (selectedId && !uniqueAlbums.has(selectedId)) {
      uniqueAlbums.set(selectedId, getAlbumTitle(container));
    }
  });

  return {
    albums: Array.from(uniqueAlbums, ([id, title]) => ({ id, title })),
  };
}

function extractSpotifyLinks() {
  const links = new Set<string>();
  const containers = document.querySelectorAll<HTMLElement>(
    'div[id^="media_link_button_container_"]',
  );

  containers.forEach((container) => {
    const rawJson = container.getAttribute("data-links");
    const data = parseDataLinks(rawJson);
    if (!data?.spotify) return;

    const entries = Object.entries(data.spotify);
    if (entries.length === 0) return;

    let bestEntry = entries.find(([, val]) => val.default);
    if (!bestEntry) bestEntry = entries[0];

    const [id, meta] = bestEntry;
    let type = (meta.type || "album").toLowerCase();
    if (type.endsWith("s")) type = type.slice(0, -1);

    links.add(`https://open.spotify.com/${type}/${id}`);
  });

  return { links: Array.from(links) };
}

// Message Listener
browser.runtime.onMessage.addListener(
  (
    req: any,
    _sender: Runtime.MessageSender,
    sendResponse: (res: any) => void,
  ) => {
    try {
      if (req.action === ACTIONS.EXTRACT_IDS) {
        sendResponse(extractSpotifyAlbumIds());
      } else if (req.action === ACTIONS.EXTRACT_LINKS) {
        sendResponse(extractSpotifyLinks());
      }
    } catch (e: any) {
      sendResponse({ error: e.message });
    }
  },
);
