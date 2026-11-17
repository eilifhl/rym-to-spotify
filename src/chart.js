(() => {
function chartNavigation(doc, url) {
    const base = new URL(url);
    const chartLink = anchor => {
        try {
            const target = new URL(anchor.getAttribute('href'), base);
            if (target.origin !== base.origin || !target.pathname.startsWith('/charts/')) return null;
            target.hash = '';
            return target.href;
        } catch { return null; }
    };
    const anchors = [...doc.querySelectorAll('a[href]')];
    const next = anchors.find(a => a.rel === 'next' || /^next\b/i.test(a.textContent.trim()) || /^next\b/i.test(a.title));
    const previous = anchors.find(a => a.rel === 'prev' || /^prev(?:ious)?\b/i.test(a.textContent.trim()));
    const first = anchors.find(a => a.textContent.trim() === '1' && chartLink(a));
    return { firstUrl: first ? chartLink(first) : null, nextUrl: next ? chartLink(next) : null, hasPrevious: !!previous && !!chartLink(previous) };
}
function readChart(doc = document, sourceUrl = doc.location?.href) {
    const entries = [];
    const items = [...doc.querySelectorAll('.page_charts_section_charts_item')];
    for (const item of items) {
        const ratingElement = item.querySelector('.page_charts_section_charts_item_details_average_num, .page_charts_section_charts_item_details_average, [itemprop="ratingValue"], [class*="average_num"], [class*="rating_average"]');
        const match = (ratingElement?.getAttribute('content') || ratingElement?.textContent || '').match(/\b([0-5](?:[.,]\d{1,2})?)\b/);
        const rating = match ? Number(match[1].replace(',', '.')) : null;
        const title = item.querySelector('.page_charts_section_charts_item_title')?.textContent?.trim() || 'Chart entry';
        let link = null;
        for (const container of item.querySelectorAll('[id^="media_link_button_container_"][data-links]')) {
            try {
                const raw = container.getAttribute('data-links');
                let data;
                try { data = JSON.parse(raw); }
                catch { data = JSON.parse(new DOMParser().parseFromString(raw, 'text/html').documentElement.textContent || ''); }
                const valid = Object.entries(data.spotify || {}).filter(([id, meta]) => /^[a-zA-Z0-9]{22}$/.test(id) && /^(albums?|tracks?)$/.test(meta.type || 'album'));
                const best = valid.find(([, meta]) => meta.default) || valid[0];
                if (!best) continue;
                link = `https://open.spotify.com/${(best[1].type || 'album').replace(/s$/, '')}/${best[0]}`;
                break;
            } catch { /* Keep the entry and rating even if its Spotify data is malformed. */ }
        }
        entries.push({ title, rating, link });
    }
    const heading = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
    const title = heading || doc.title.replace(/\s*[-|–]\s*Rate Your Music.*$/i, '').trim() || 'RYM chart';
    return chartFromEntries({ title, url: sourceUrl, entries, ...chartNavigation(doc, sourceUrl) }, entries);
}
function chartFromEntries(chart, entries) {
    const links = [...new Set(entries.map(entry => entry.link).filter(Boolean))];
    const albums = links.filter(link => link.includes('/album/')).map(link => ({ id: link.split('/').pop(), title: entries.find(entry => entry.link === link).title }));
    return { ...chart, entries, links, albums };
}
async function collectChartPages(current, options = {}, progress = () => {}, signal) {
    if (!options || options.range === 'current') return current;
    const endPage = options.range === 'pages' ? Number(options.endPage) : Infinity;
    const minimumRating = options.range === 'rating' ? Number(options.minimumRating) : null;
    if (!['pages', 'rating'].includes(options.range)) throw new Error('Choose which chart pages to include.');
    if (options.range === 'pages' && (!Number.isInteger(endPage) || endPage < 1)) throw new Error('Enter a whole page number of at least 1.');
    if (minimumRating !== null && (!Number.isFinite(minimumRating) || minimumRating < 0 || minimumRating > 5 || options.minimumRating === '')) throw new Error('Enter a minimum rating between 0 and 5.');
    if (current.hasPrevious && !current.firstUrl) throw new Error('Open page 1 of this chart to start a playlist across pages.');
    const origin = new URL(current.url).origin;
    const visited = new Set();
    const entries = [];
    let url = current.firstUrl || current.url;
    let pagesRead = 0;
    let skipped = 0;
    while (url) {
        signal?.throwIfAborted();
        const target = new URL(url);
        target.hash = '';
        if (target.origin !== origin || !target.pathname.startsWith('/charts/')) throw new Error('RYM returned an invalid next-page link.');
        if (visited.has(target.href)) throw new Error('RYM repeated a chart page. No playlist was created.');
        visited.add(target.href);
        progress(`Reading chart page ${pagesRead + 1}…`);
        let chart;
        const currentUrl = new URL(current.url); currentUrl.hash = '';
        if (target.href === currentUrl.href) chart = current;
        else {
            // Fetch in the RYM content script, using the page's existing site access.
            const response = await fetch(target.href, { credentials: 'same-origin', signal });
            if (!response.ok) throw new Error(`RYM could not load page ${pagesRead + 1} (${response.status}). Try again later; no playlist was created.`);
            if (response.url && new URL(response.url).href.replace(/#.*$/, '') !== target.href) throw new Error('RYM redirected the chart request. Open the chart in your browser and try again.');
            chart = readChart(new DOMParser().parseFromString(await response.text(), 'text/html'), target.href);
            if (!chart.entries.length) throw new Error('RYM returned no chart results. It may require a browser check. No playlist was created.');
        }
        if (!chart.entries.length) throw new Error('No chart entries found on this page.');
        pagesRead++;
        for (const entry of chart.entries) {
            if (minimumRating !== null) {
                if (entry.rating === null) throw new Error(`Could not read the rating for “${entry.title}”. No playlist was created.`);
                if (entry.rating < minimumRating) return chartFromEntries({ ...current, pagesRead, skipped }, entries);
            }
            entries.push(entry);
            if (!entry.link) skipped++;
        }
        if (pagesRead >= endPage || !chart.nextUrl) break;
        url = chart.nextUrl;
        // Keep requests sequential and leave a pause between chart pages.
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return chartFromEntries({ ...current, pagesRead, skipped }, entries);
}
Object.assign(globalThis.RymSpotify ??= {}, { readChart, collectChartPages });
})();
