// The MCP server's live_relay (#4574, server/mcp-relay.js), as the Collaboration tab's Cloudflare Relay box: none set;
// a new key; set (a Cloudflare Worker's address only, checked first: refused with the check's message, not kept), read
// back without its key, checked again, forgotten; share_project relay: true shares through it (its links on the Silinx
// site, naming the relay), as via: cloudflare does (#4634, Share Project… ▸ Live's choice), and follow_project follows
// them; refused: relay or via: cloudflare with no relay set, with server or key, with another action; via: peer (the
// page's peer to peer: no WebRTC here). The relay is the real Worker (packages/silinx-relay-cloudflare) on the Workers shim; its
// workers.dev address taken to the shim by the WebSocket and fetch given to the tool.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket as WS } from 'ws';
import { scratchEnv } from './server-helpers.js';
import { serveWorker } from './workers-shim.js';
import worker, { RelayRoom, NEEDS_KEY } from '../packages/silinx-relay-cloudflare/src/worker.js';
import { DEPLOY_URL } from '../core/relay-setup.js';
import { parseFollowLink } from '../core/collab-link.js';

const KEY = 'a-relay-key-of-24-characters-or-more';
const AT = 'https://silinx-relay.class.workers.dev';
let tmp, relay, saved;
// (the relay's workers.dev address, to the shim)
const toShim = u => String(u).replace(AT, relay.url).replace(AT.replace('https:', 'wss:'), relay.url.replace('http:', 'ws:'));
class Mapped extends WS { constructor(url, protocols, opts) { super(toShim(url), protocols, opts); } }
before(async () => {
  tmp = await scratchEnv('silinx-mcp-relay-');
  relay = await serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: 'https://pmnmalo.github.io' }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}) } });
  saved = globalThis.WebSocket;
  globalThis.WebSocket = Mapped;   // (share_project's and follow_project's WebSockets)
});
after(async () => {
  const { endCollab } = await import('../server/mcp-collab.js');
  await endCollab();
  globalThis.WebSocket = saved;
  await relay.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const { handle } = await import('../server/mcp.js');
const { relayTool } = await import('../server/mcp-relay.js');
const tool = () => relayTool({ fetch: (u, init) => fetch(toShim(u), init), WebSocket: Mapped });
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const config = () => { try { return JSON.parse(fs.readFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), 'utf8')); } catch { return {}; } };
// live_relay with the shim's fetch and WebSocket (its tool's run, as handle runs it)
const relayCall = async (args) => { try { const r = await tool().run(args); return { text: r.text, data: r.data, isError: false }; } catch (e) { return { text: e.message, isError: true }; } };

test('#4574 live_relay: none set; a new key; set refused (not a Worker, short key, wrong key: not kept); set, read back without its key, checked, forgotten', async () => {
  const none = await call('live_relay', {});
  assert.equal(none.isError, false);
  assert.equal(none.text, `No Cloudflare relay set. To make one: live_relay new_key, the user deploys it (${DEPLOY_URL}), then live_relay set with its address and key.`);
  assert.deepEqual(none.data, { relay: null, keySet: false, deploy: DEPLOY_URL });
  const k = await call('live_relay', { action: 'new_key' });
  assert.match(k.data.key, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(k.text, `A new relay key (give it to Cloudflare when it asks for RELAY_KEY, then live_relay set with the relay's address and this key; keep it somewhere safe):\n${k.data.key}\nDeploy to Cloudflare: ${DEPLOY_URL}`);
  assert.notEqual((await call('live_relay', { action: 'new_key' })).data.key, k.data.key);
  // refused, nothing kept
  assert.deepEqual(await relayCall({ action: 'set', address: 'https://evil.example', key: KEY }), { text: 'address: \'https://evil.example\' is not a Cloudflare Worker\'s address (https://<name>.<account>.workers.dev)', isError: true });
  assert.deepEqual(await relayCall({ action: 'set', address: AT, key: 'short' }), { text: 'key: the key is too short: a relay\'s key has 24 characters at least', isError: true });
  assert.deepEqual(await relayCall({ action: 'set', address: AT, key: 'x'.repeat(30) }), { text: `ERROR: the relay at silinx-relay.class.workers.dev refused its key: ${NEEDS_KEY}: not set`, isError: true });
  assert.deepEqual(await relayCall({ action: 'status', address: AT }), { text: 'address, key: with action set only', isError: true });
  assert.deepEqual(await relayCall({ action: 'check' }), { text: 'no Cloudflare relay is set (live_relay set)', isError: true });
  assert.equal(config().liveRelay, undefined);
  // set: checked, kept
  assert.deepEqual(await relayCall({ action: 'set', address: `${AT}/`, key: KEY }), { text: 'The relay at silinx-relay.class.workers.dev answers and takes its key. Set: share_project relay: true shares through it.', data: { relay: AT, ok: true }, isError: false });
  assert.deepEqual(config().liveRelay, { address: AT, key: KEY });
  const st = await call('live_relay', { action: 'status' });
  assert.equal(st.text, `The Cloudflare relay set: ${AT} (its key set). share_project relay: true shares through it.`);
  assert.deepEqual(st.data, { relay: AT, keySet: true, deploy: DEPLOY_URL });
  assert.ok(!JSON.stringify(st).includes(KEY), 'the key in no result');
  assert.deepEqual(await relayCall({ action: 'check' }), { text: 'The relay at silinx-relay.class.workers.dev answers and takes its key.', data: { relay: AT, ok: true }, isError: false });
});

test('#4574 #4634 share_project relay: true or via: cloudflare: through the relay set, its links on the Silinx site naming it; follow_project follows them; refused without one, with server or key; via: peer refused (a page\'s only)', async () => {
  assert.equal((await call('new_project', { name: 'r' })).isError, false);
  for (const [args, msg] of [[{ relay: true, server: 'http://127.0.0.1:8642' }, 'relay: without server or key (the relay set has its own)'], [{ relay: true, key: KEY }, 'relay: without server or key (the relay set has its own)'], [{ relay: true, action: 'status' }, 'relay: with action start only'],
    // (#4634: Share Project… ▸ Live's choice by name; peer to peer a page's only)
    [{ via: 'cloudflare', server: 'http://127.0.0.1:8642' }, 'via: without server or key (the relay set has its own)'], [{ via: 'cloudflare', action: 'status' }, 'via: with action start only'],
    [{ via: 'peer' }, 'via: one of cloudflare, server'], [{ relay: true, via: 'server' }, 'relay: true is via: cloudflare, not server']]) {
    const r = await call('share_project', { project: 'r', ...args });
    assert.equal(r.isError, true);
    assert.equal(r.text, `share_project: ${msg}`);
  }
  const s = await call('share_project', { project: 'r', name: 'Ana', relay: true, editors: true });
  assert.equal(s.isError, false, s.text);
  for (const l of [s.data.link, s.data.editLink]) {
    assert.ok(l.startsWith('https://pmnmalo.github.io/Silinx/#'), l);
    assert.equal(parseFollowLink(l).relay, AT);
    assert.equal(parseFollowLink(l).via, 'relay');
    assert.ok(!l.includes(KEY));
  }
  const f = await call('follow_project', { link: s.data.link, name: 'Rui' });
  assert.equal(f.isError, false, f.text);
  assert.equal(f.data.owner, 'Ana');
  assert.equal((await call('share_project', { project: 'r', action: 'stop' })).isError, false);
  // (#4634) via: cloudflare, the same
  const v = await call('share_project', { project: 'r', name: 'Ana', via: 'cloudflare' });
  assert.equal(v.isError, false, v.text);
  assert.ok(v.data.link.startsWith('https://pmnmalo.github.io/Silinx/#'), v.data.link);
  assert.equal(parseFollowLink(v.data.link).relay, AT);
  assert.equal(v.data.editLink, undefined);
  const g = await call('follow_project', { link: v.data.link, name: 'Rui' });
  assert.equal(g.isError, false, g.text);
  assert.equal(g.data.owner, 'Ana');
  assert.equal((await call('share_project', { project: 'r', action: 'stop' })).isError, false);
  // forgotten: share_project relay: true refused
  assert.deepEqual(await relayCall({ action: 'forget' }), { text: `The Cloudflare relay ${AT} forgotten: share_project shares through the Silinx server again.`, data: { relay: null }, isError: false });
  assert.equal(config().liveRelay, null);
  assert.deepEqual(await relayCall({ action: 'forget' }), { text: 'No Cloudflare relay was set.', data: { relay: null }, isError: false });
  const r = await call('share_project', { project: 'r', relay: true });
  assert.equal(r.isError, true);
  assert.equal(r.text, 'share_project: relay: no Cloudflare relay is set (live_relay)');
  const w = await call('share_project', { project: 'r', via: 'cloudflare' });
  assert.equal(w.isError, true);
  assert.equal(w.text, 'share_project: via: no Cloudflare relay is set (live_relay)');
});
