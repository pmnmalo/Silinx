// The local server's routes of the files it downloads once (a Pico's firmware, #5494; the ESP32's JSPI build, #5658): a
// name it does not serve a 404 that never repeats it (CodeQL's reflected XSS, #5721-#5724), as JSON, nothing downloaded.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmp, srv, base;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-vendor-routes-'));
  Object.assign(process.env, { SILINX_WORKSPACE: path.join(tmp, 'ws'), SILINX_CONFIG_DIR: path.join(tmp, 'cfg'),
    SILINX_RP2040_CACHE: path.join(tmp, 'rp2040'), SILINX_MICROPYTHON_JSPI_CACHE: path.join(tmp, 'jspi') });
  const { createApp } = await import('../server/server.js');
  const app = await createApp();
  await new Promise(r => { srv = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => {
  srv.closeAllConnections?.();
  await new Promise(r => srv.close(r));
  for (const k of ['SILINX_RP2040_CACHE', 'SILINX_MICROPYTHON_JSPI_CACHE']) delete process.env[k];
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('#5721 a file not served: a 404 as JSON, its name not repeated; nothing downloaded', async () => {
  const name = encodeURIComponent('<img src=x onerror=alert(1)>.uf2');
  for (const route of ['/vendor/rp2040/', '/vendor/micropython-jspi/']) {
    const r = await fetch(base + route + name);
    const body = await r.text();
    assert.deepEqual([r.status, r.headers.get('content-type'), r.headers.get('x-content-type-options'), body],
      [404, 'application/json; charset=utf-8', 'nosniff', '{"error":"no such file"}'], route);
  }
  const kept = d => (fs.existsSync(path.join(tmp, d)) ? fs.readdirSync(path.join(tmp, d)) : []);
  assert.deepEqual([kept('rp2040'), kept('jspi')], [[], []]);
});
