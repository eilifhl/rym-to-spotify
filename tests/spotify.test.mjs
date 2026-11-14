import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { albumTracks, createPlaylist } from '../src/spotify.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const id = n => String(n).padStart(22, '0');
const link = n => `https://open.spotify.com/track/${id(n)}`;
const source = 'https://rateyourmusic.com/charts/top/album/all-time/';
const json = data => new Response(JSON.stringify(data));

test('expands every album page, preserving order and skipping unavailable songs', async () => {
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    return urls.length === 1
      ? json({ items: [{ id: id(1) }, { id: id(2), is_playable: false }], next: 'next' })
      : json({ items: [{ id: id(3) }], next: null });
  };
  assert.deepEqual(await albumTracks('token', id(9)), [link(1), link(3)]);
  assert.match(urls[1], /offset=2/);
});

test('creates a private named playlist and adds ordered unique songs in batches of 100', async () => {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return json(requests.length === 1 ? { id: 'playlist' } : { snapshot_id: 'snapshot' });
  };
  const links = Array.from({ length: 205 }, (_, i) => link(i));
  const result = await createPlaylist('token', 'Best albums of 2026', [...links, links[0]], source);
  assert.equal(requests[0].url, 'https://api.spotify.com/v1/me/playlists');
  assert.equal(requests[0].body.name, 'Best albums of 2026');
  assert.equal(requests[0].body.public, false);
  assert.match(requests[0].body.description, /rateyourmusic/);
  assert.deepEqual(requests.slice(1).map(r => r.body.uris.length), [100, 100, 5]);
  assert.equal(requests[1].url, 'https://api.spotify.com/v1/playlists/playlist/items');
  assert.equal(requests[2].body.uris[0], `spotify:track:${id(100)}`);
  assert.equal(result.added, 205);
  assert.equal(result.success, true);
});

test('reports a partial playlist with a usable link when a later batch fails', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return json({ id: 'partial' });
    if (calls === 2) return json({ snapshot_id: 'snapshot' });
    return new Response('{}', { status: 429, headers: { 'Retry-After': '30' } });
  };
  const result = await createPlaylist('token', 'Chart', Array.from({ length: 101 }, (_, i) => link(i)), source);
  assert.equal(result.added, 100);
  assert.equal(result.url, 'https://open.spotify.com/playlist/partial');
  assert.match(result.error, /100 of 101/);
  assert.match(result.error, /30 seconds/);
});

test('rejects album URLs before creating a playlist', async () => {
  globalThis.fetch = () => { assert.fail('Must not call Spotify'); };
  await assert.rejects(createPlaylist('token', 'Chart', [`https://open.spotify.com/album/${id(1)}`], source), /only contain Spotify tracks/);
});

test('surfaces Spotify permission errors', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  await assert.rejects(albumTracks('token', id(1)), /Reconnect Spotify/);
});
