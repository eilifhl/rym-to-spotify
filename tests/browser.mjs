import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Load the source scripts in the same order as the extension manifest.
const directory = '/tmp/rym-extension-test';
mkdirSync(directory, { recursive: true });
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const sourceRoot = pathToFileURL(`${process.cwd()}/`).href;
const scripts = manifest.content_scripts[0].js.map(path => {
  if (path !== 'src/content_script.js') return `<script src="${pathToFileURL(resolve(path)).href}"></script>`;
  const original = readFileSync(path, 'utf8');
  const guard = "location.pathname.startsWith('/charts/')";
  assert(original.includes(guard));
  // Local fixtures run at file:// URLs; bypass only the chart route guard.
  return `<script>${original.replace(guard, 'true')}</script>`;
}).join('\n');
const fixture = readFileSync('tests/chart.html', 'utf8')
  .replace('<!-- extension scripts -->', scripts)
  .replace('__EXTENSION_ROOT__', sourceRoot);
writeFileSync(`${directory}/chart.html`, fixture);
const setupFixture = readFileSync('src/setup.html', 'utf8')
 .replaceAll('href="setup.css"', `href="${sourceRoot}src/setup.css"`)
 .replaceAll('src="icon.svg"', `src="${sourceRoot}src/icon.svg"`)
 .replace('<script src="actions.js"></script>', `<script>${readFileSync('tests/setup-fixture.js', 'utf8')}</script><script src="${sourceRoot}src/actions.js"></script>`)
 .replace('<script src="setup.js"></script>', `<script src="${sourceRoot}src/setup.js"></script><pre id="test-results">Running…</pre><script>${readFileSync('tests/setup-checks.js', 'utf8')}</script>`);
writeFileSync(`${directory}/setup.html`, setupFixture);
for (const [page, theme, width, height] of [['chart', 'light', 1050, 950], ['chart', 'dark', 1050, 950], ['setup', 'light', 850, 1800], ['setup', 'dark', 390, 2400]]) {
 const res = spawnSync('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-proxy-server', '--disable-dev-shm-usage', '--allow-file-access-from-files', '--virtual-time-budget=10000', '--dump-dom', `--screenshot=${directory}/${page}-${theme}.png`, `--window-size=${width},${height}`, `file://${directory}/${page}.html${theme === 'dark' ? '#dark' : ''}`], { encoding:'utf8', timeout:20000, maxBuffer:2e6 });
 assert.equal(res.status, 0, res.stderr);
 const report = /<pre id="test-results">([^<]*)<\/pre>/.exec(res.stdout)?.[1];
 assert(report && !report.includes('FAIL:') && !report.includes('Running'), report || res.stderr);
 console.log(`${page} ${theme}:\n${report}`);
}
