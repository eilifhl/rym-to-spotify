import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Exercise the actual built content script with browser/Spotify/clipboard adapters.
const directory = '/tmp/rym-extension-test';
mkdirSync(directory, { recursive: true });
const originalContent = readFileSync('dist/content_script.js', 'utf8');
assert(originalContent.includes('location.pathname.startsWith("/charts/")'));
const content = originalContent.replace('location.pathname.startsWith("/charts/")', 'true');
const fixture = readFileSync('tests/chart.html', 'utf8').replace('<script src="../dist/content_script.js"></script>', `<script>${content}</script>`);
writeFileSync(`${directory}/chart.html`, fixture);
for (const theme of ['light', 'dark']) {
 const res = spawnSync('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-proxy-server', '--disable-dev-shm-usage', '--allow-file-access-from-files', '--virtual-time-budget=3000', '--dump-dom', `--screenshot=${directory}/${theme}.png`, '--window-size=1050,950', `file://${directory}/chart.html${theme === 'dark' ? '#dark' : ''}`], { encoding:'utf8', timeout:20000, maxBuffer:2e6 });
 assert.equal(res.status, 0, res.stderr);
 const report = /<pre id="test-results">([^<]*)<\/pre>/.exec(res.stdout)?.[1];
 assert(report && !report.includes('FAIL:') && !report.includes('Running'), report || res.stderr);
 console.log(`${theme}:\n${report}`);
}
