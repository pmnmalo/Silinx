// A relay of one's own on Cloudflare checked before it is used (#4574, core/relay-setup.js): its key made (WebCrypto),
// a key's problems, the wrangler.toml line that lets a site in, and the check against the real Worker
// (packages/silinx-relay-cloudflare) on the Workers shim (test/workers-shim.js), over real WebSockets: a relay that
// answers, lets the page's site in and takes its key; a wrong key, a relay with no key, a site it does not let in (the
// exact ORIGINS line), an address that is no relay, one that does not answer, one that is not an address; the key in
// no message and no address; nothing kept on the relay. Its root's answer to any page (CORS, Silinx-Origins).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { serveWorker } from './workers-shim.js';
import worker, { RelayRoom, ABOUT, NEEDS_KEY, NO_KEY } from '../packages/silinx-relay-cloudflare/src/worker.js';
import { checkRelay, newRelayKey, keyProblem, originsLine, RELAY_ABOUT, DEPLOY_URL, KEY_MIN } from '../core/relay-setup.js';

const KEY = 'a-relay-key-of-24-characters-or-more';
const SITE = 'https://pmnmalo.github.io';
let relay;
before(async () => { relay = await serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: `${SITE} http://127.0.0.1:8642` }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}) } }); });
after(async () => { await relay.close(); });
// a WebSocket that remembers the addresses it was given (the key in none)
const opened = [];
class WS extends WebSocket { constructor(url, protocols, opts) { opened.push(String(url)); super(url, protocols, opts); } }
// (a page's fetch: its Origin sent)
const pageFetch = origin => (url, init) => fetch(url, { ...init, headers: { Origin: origin } });
const host = () => new URL(relay.url).host;

test('its key: 43 characters of base64url, each new; a key\'s problems; the ORIGINS line; the deploy button\'s address', () => {
  const a = newRelayKey(), b = newRelayKey();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(keyProblem(a), null);
  assert.equal(keyProblem(''), 'no key: give the relay\'s key (its RELAY_KEY)');
  assert.equal(keyProblem('x'.repeat(KEY_MIN - 1)), 'the key is too short: a relay\'s key has 24 characters at least');
  assert.equal(keyProblem('x'.repeat(KEY_MIN)), null);
  assert.equal(keyProblem(`${'x'.repeat(30)} y`), 'the key has spaces or characters other than ASCII letters, digits and signs');
  assert.equal(originsLine([SITE], 'http://127.0.0.1:8642'), 'ORIGINS = "https://pmnmalo.github.io http://127.0.0.1:8642"');
  assert.equal(originsLine([SITE], SITE), 'ORIGINS = "https://pmnmalo.github.io"');
  assert.equal(originsLine([], 'https://x.example'), 'ORIGINS = "https://x.example"');
  assert.ok(ABOUT.startsWith(RELAY_ABOUT), 'the Worker\'s ABOUT is what the check looks for');
  assert.equal(DEPLOY_URL, 'https://deploy.workers.cloudflare.com/?url=https://github.com/pmnmalo/Silinx/tree/main/packages/silinx-relay-cloudflare');
});

test('its root answers any page (CORS) with the origins it lets in', async () => {
  const res = await fetch(`${relay.url}/`, { headers: { Origin: 'https://elsewhere.example' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('access-control-expose-headers'), 'Silinx-Origins');
  assert.equal(res.headers.get('silinx-origins'), `${SITE} http://127.0.0.1:8642`);
  assert.equal(await res.text(), ABOUT);
});

test('a relay that answers, lets the page\'s site in and takes its key: ok; nothing kept on it; the key in no address', async () => {
  opened.length = 0;
  const r = await checkRelay({ address: `${relay.url}/some/path`, key: KEY, origin: SITE, fetch: pageFetch(SITE), WebSocket: WS });
  assert.deepEqual(r, { ok: true, address: relay.url, lines: [`The relay at ${host()} answers, lets this site in and takes its key.`] });
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^ws:\/\/127\.0\.0\.1:\d+\/api\/collab\/meet\/host\?topic=[A-Za-z0-9_-]{32}$/);
  assert.ok(!opened.some(u => u.includes(KEY)));
  // (its meeting point closed once it is left: no host left at any topic)
  const t0 = Date.now();
  while (relay.sockets().length && Date.now() - t0 < 3000) await new Promise(res => setTimeout(res, 10));
  assert.equal(relay.sockets().length, 0);
  // a program (the MCP's): no origin, not checked
  const p = await checkRelay({ address: relay.url, key: KEY, WebSocket: WS });
  assert.deepEqual(p.lines, [`The relay at ${host()} answers and takes its key.`]);
});

test('refused: a wrong key, a relay with no key, a site it does not let in (the exact ORIGINS line); the key in no message', async () => {
  const wrong = await checkRelay({ address: relay.url, key: 'x'.repeat(30), origin: SITE, fetch: pageFetch(SITE), WebSocket: WS });
  assert.deepEqual(wrong, { ok: false, address: relay.url, error: `the relay at ${host()} refused its key: ${NEEDS_KEY}` });
  const site = 'http://127.0.0.1:9999';
  const other = await checkRelay({ address: relay.url, key: KEY, origin: site, fetch: pageFetch(site), WebSocket: WS });
  assert.deepEqual(other, { ok: false, address: relay.url, line: 'ORIGINS = "https://pmnmalo.github.io http://127.0.0.1:8642 http://127.0.0.1:9999"',
    error: `the relay at ${host()} does not let this site in (http://127.0.0.1:9999): add it to its ORIGINS (in Cloudflare: the Worker's Settings ▸ Variables and Secrets, or wrangler.toml, then deploy it again): ORIGINS = "https://pmnmalo.github.io http://127.0.0.1:8642 http://127.0.0.1:9999"` });
  const bare = await serveWorker({ worker, env: { ORIGINS: SITE }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}) } });
  try {
    const none = await checkRelay({ address: bare.url, key: KEY, WebSocket: WS });
    assert.deepEqual(none, { ok: false, address: bare.url, error: `the relay at ${new URL(bare.url).host} refused its key: ${NO_KEY}` });
    for (const r of [wrong, other, none]) assert.ok(!JSON.stringify(r).includes(KEY));
  } finally { await bare.close(); }
});

test('not a relay: no address, a bad key, a page that is not one, nothing answering', async () => {
  assert.deepEqual(await checkRelay({ address: 'silinx-relay.workers.dev', key: KEY }), { ok: false, address: null, error: 'the relay\'s address is not an http(s) address: \'silinx-relay.workers.dev\'' });
  assert.deepEqual(await checkRelay({ address: relay.url, key: 'short' }), { ok: false, address: relay.url, error: 'the key is too short: a relay\'s key has 24 characters at least' });
  const srv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Some site</title>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.deepEqual(await checkRelay({ address: at, key: KEY, WebSocket: WS }), { ok: false, address: at, error: `127.0.0.1:${srv.address().port} is not a relay of Silinx's shared projects (its address answers 200: "<!doctype html><title>Some site</title>")` });
  } finally { srv.closeAllConnections(); await new Promise(r => srv.close(r)); }
  const down = await checkRelay({ address: at, key: KEY, WebSocket: WS, fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(down, { ok: false, address: at, error: `the relay at ${new URL(at).host} does not answer (fetch failed): is the address right, is it deployed? (a relay deployed before November 2026 answers no page: deploy it again)` });
});
