export function readChart(doc = document) {
    const links = new Set();
    const albums = new Map();
    for (const container of doc.querySelectorAll('[id^="media_link_button_container_"][data-links]')) {
        try {
            const raw = container.getAttribute('data-links');
            let data;
            try {
                data = JSON.parse(raw);
            }
            catch {
                data = JSON.parse(new DOMParser().parseFromString(raw, 'text/html').documentElement.textContent || '');
            }
            const entries = Object.entries(data.spotify || {});
            const valid = entries.filter(([id, meta]) => /^[a-zA-Z0-9]{22}$/.test(id) && /^(albums?|tracks?)$/.test(meta.type || 'album'));
            const best = valid.find(([, meta]) => meta.default) || valid[0];
            if (!best)
                continue;
            const [id, meta] = best;
            const type = (meta.type || 'album').replace(/s$/, '');
            links.add(`https://open.spotify.com/${type}/${id}`);
            if (type === 'album') {
                const item = container.closest('.page_charts_section_charts_item');
                const title = item?.querySelector('.page_charts_section_charts_item_title')?.textContent?.trim() || 'Album';
                albums.set(id, title);
            }
        }
        catch { /* A malformed entry must not hide the rest of the chart. */ }
    }
    const heading = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
    const title = heading || doc.title.replace(/\s*[-|–]\s*Rate Your Music.*$/i, '').trim() || 'RYM chart';
    return { title, url: doc.location.href, links: [...links], albums: [...albums].map(([id, title]) => ({ id, title })) };
}
