(() => {
const { ACTIONS, mountPanel } = globalThis.RymSpotify;
const main = document.querySelector('main');
async function init() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    try {
        const chart = await browser.tabs.sendMessage(tab.id, { action: ACTIONS.GET_CHART });
        if (!chart?.url)
            throw new Error('No chart');
        mountPanel(main, async options => {
            const result = await browser.tabs.sendMessage(tab.id, { action: ACTIONS.GET_CHART, options });
            if (result.error) throw new Error(result.error);
            return result;
        });
    }
    catch {
        main.textContent = 'Open a RateYourMusic chart to copy Spotify links or create a playlist. Reload an already open chart after installing the extension.';
    }
}
void init();
})();
