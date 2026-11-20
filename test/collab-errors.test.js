// Live sharing's errors that vanished (#4759): a control message of the relay whose handling fails no longer stops the
// client (every later message was skipped), and the failure is said, once (core/collab-client.js); a frame that cannot
// be sealed, said, the next one sent. On a fake relay socket (the test answers the open itself). The server's
// unhandledRejection handler: a stray rejection said on its console, the server still answering
// (server/server.js startServer, in a process of its own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shareRoom } from '../core/collab-client.js';
import { projectDoc, publishProject } from '../core/collab-doc.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };

// a relay's socket the test plays: the open answered; `say(msg)` a control message from the relay
function fakeRelay() {
  const socks = [];
  class FakeSocket extends EventTarget {
    constructor() { super(); this.readyState = 0; this.sent = []; socks.push(this); setTimeout(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }, 0); }
    send(d) {
      this.sent.push(d);
      const m = typeof d === 'string' ? JSON.parse(d) : null;
      if (m?.type === 'open') setTimeout(() => this.say({ type: 'opened', room: 'r'.repeat(22), resume: 'x'.repeat(22) }), 0);
    }
    say(msg) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(msg) })); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  return { FakeSocket, socks };
}
const doc = () => { const d = projectDoc(); publishProject(d, { project: { name: 'p', files: [] }, files: {}, owner: 'Ana' }); return d; };

test('#4759 a control message whose handling fails: said once, the later ones still handled', async () => {
  const { FakeSocket, socks } = fakeRelay();
  const events = [];
  let throws = 1;
  const onEvent = e => { events.push(e); if (e.type === 'error' && /^first/.test(e.message) && throws-- > 0) throw new Error('the page failed'); };
  const owner = await shareRoom({ url: 'ws://relay.invalid/', doc: doc(), user: { name: 'Ana' }, WebSocket: FakeSocket, onEvent, reconnect: false });
  socks[0].say({ type: 'error', message: 'first' });
  socks[0].say({ type: 'error', message: 'second' });
  socks[0].say({ type: 'error', message: 'first again' });
  await until(() => events.some(e => e.message === 'first again'), 'the later messages handled');
  assert.deepEqual(events.filter(e => e.type === 'error').map(e => e.message), ['first', 'a message of the relay could not be handled: the page failed', 'second', 'first again']);
  await owner.close();
}, { timeout: 15000 });

test('#4759 the server: a stray rejection said on its console, the server goes on', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-stray-'));
  const script = `
    const { startServer } = await import(${JSON.stringify(path.join(here, '..', 'server', 'server.js'))});
    const srv = await startServer({ port: 0 });
    Promise.reject(new Error('a stray failure'));
    await new Promise(r => setTimeout(r, 200));
    const r = await fetch('http://127.0.0.1:' + srv.address().port + '/');
    console.log('ANSWERED ' + r.status);
    srv.close(); srv.closeAllConnections?.();
    process.exit(0);`;
  const env = { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg'), SILINX_WORKSPACE: path.join(tmp, 'ws'), SILINX_NO_BROWSER: '1' };
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env });
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  const code = await new Promise(r => child.on('close', r));
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(code, 0, err);
  assert.match(out, /^ANSWERED 200$/m);
  assert.deepEqual(err.split('\n').filter(l => /^(ERROR|WARNING)/.test(l)), ['ERROR: an unexpected failure (the server goes on): Error: a stray failure']);
}, { timeout: 60000 });
