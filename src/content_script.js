(() => {
const { ACTIONS, readChart, collectChartPages, mountPanel } = globalThis.RymSpotify;
browser.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req.action === ACTIONS.GET_CHART) {
        if (req.options) {
            collectChartPages(readChart(), req.options).then(sendResponse).catch(error => sendResponse({ error: error.message }));
            return true;
        }
        sendResponse(readChart());
    }
    else if (req.action === ACTIONS.EXTRACT_LINKS)
        sendResponse({ links: readChart().links });
    else if (req.action === ACTIONS.EXTRACT_IDS)
        sendResponse({ albums: readChart().albums });
});
// Locate the filter card by its action and visible box, rather than relying on
// RYM's layout classes (which differ between chart layouts).
function findFilterCard() {
    const update = Array.from(document.querySelectorAll('button, input, a, span, div'))
        .find(element => {
        const text = element instanceof HTMLInputElement ? element.value : element.textContent;
        return text?.trim().toLowerCase() === 'update chart' && element.childElementCount === 0;
    });
    let borderedCard = null;
    let form = null;
    for (let card = update?.parentElement; card && card !== document.body; card = card.parentElement) {
        if (card.querySelector('.page_charts_section_charts_item, h1'))
            break;
        const style = getComputedStyle(card);
        const bordered = parseFloat(style.borderLeftWidth) > 0 && parseFloat(style.borderRightWidth) > 0;
        if (card.getBoundingClientRect().height <= 100)
            continue;
        if (bordered)
            borderedCard = card;
        if (card.tagName === 'FORM')
            form = card;
    }
    // The form can have its own border inside the outer filter card. Use the
    // outer card so the Spotify panel becomes its sibling, outside the filters.
    return borderedCard || form || document.querySelector('.page_charts_section_filters, #page_charts_section_filters, .page_charts_section_filter, #page_charts_section_filter');
}
function insertPanel() {
    if (!location.pathname.startsWith('/charts/'))
        return;
    const filters = findFilterCard();
    if (!filters)
        return;
    const existing = document.getElementById('rym-spotify-panel');
    function matchCard(host) {
        const style = getComputedStyle(filters);
        host.style.setProperty('--rym-card-background', style.backgroundColor);
        host.style.setProperty('--rym-card-border', style.borderTopColor);
        host.style.setProperty('--rym-card-radius', style.borderTopLeftRadius);
    }
    if (existing) {
        // Filters may be replaced after changing chart options.
        if (filters.nextElementSibling !== existing)
            filters.after(existing);
        matchCard(existing);
        return;
    }
    const host = document.createElement('div');
    host.id = 'rym-spotify-panel';
    filters.after(host);
    matchCard(host);
    mountPanel(host.attachShadow({ mode: 'open' }), (options, progress, signal) => options ? collectChartPages(readChart(), options, progress, signal) : Promise.resolve(readChart()));
}
let scheduled = false;
function scheduleInsert() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; insertPanel(); }, 0);
}
// RYM can reveal or style existing filters after the first attempt. Observe
// those changes too, excluding our own host's style updates to avoid a loop.
new MutationObserver(records => {
    if (records.some(record => !record.target.closest?.('#rym-spotify-panel'))) scheduleInsert();
}).observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
});
window.addEventListener('load', scheduleInsert);
window.addEventListener('pageshow', scheduleInsert);
window.addEventListener('resize', scheduleInsert);
insertPanel();
// Re-sample card colors when RYM switches themes without reloading the chart.
const themeObserver = new MutationObserver(insertPanel);
for (const element of [document.documentElement, document.body]) {
    themeObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
}
})();
