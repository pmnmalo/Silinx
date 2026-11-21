// The FPGA view's model built off the server's thread (#4774): server/fpga-view-worker.js (the model and its kept
// grids), server/fpga-view.js (one worker, the requests for one model sharing it) and the route
// GET /projects/:p/fpga-view answering the server's other requests while a big device is parsed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, startApp, HERE } from './server-helpers.js';
import { buildModel } from '../server/fpga-view-worker.js';
import { fpgaViewModel, stopFpgaViewWorker } from '../server/fpga-view.js';
import { parseXdl, parseXdlrc, fpgaModel } from '../packages/silinx-fpga/src/parts.js';

const FIX = path.join(HERE, '..', 'packages', 'silinx-fpga', 'test', 'fixtures', 'fpga');
const XDL = path.join(FIX, 'top.xdl'), XDLRC = path.join(FIX, 'device.xdlrc');
const reference = async (xdl, xdlrc) =>
  ({ available: true, ...fpgaModel(parseXdl(await fs.readFile(xdl, 'utf8')), parseXdlrc(await fs.readFile(xdlrc, 'utf8'))) });

let tmp, app, P;
before(async () => {
  tmp = await scratchEnv('silinx-fpga-view-test-');
  P = await import('../server/projects.js');
  app = await startApp();
});
after(async () => {
  await stopFpgaViewWorker();
  await app.close();
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('#4774 buildModel: the ISE design\'s model as the one built in the server\'s thread; the last two grids kept by file and time', async () => {
  assert.deepEqual(await buildModel({ source: 'ise', xdl: XDL, xdlrc: XDLRC, xdlrcMtime: 1 }), await reference(XDL, XDLRC));
  // another device's text under the same file and time: the kept grid; a new time: parsed again
  const dev = path.join(tmp, 'device.xdlrc');
  await fs.copyFile(XDLRC, dev);
  assert.equal((await buildModel({ source: 'ise', xdl: XDL, xdlrc: dev, xdlrcMtime: 1 })).device.part, 'xc3s50etq144-4');
  await fs.writeFile(dev, (await fs.readFile(XDLRC, 'utf8')).replace('xc3s50etq144-4', 'xc3s100etq144-4'));
  assert.equal((await buildModel({ source: 'ise', xdl: XDL, xdlrc: dev, xdlrcMtime: 1 })).device.part, 'xc3s50etq144-4', 'kept');
  assert.equal((await buildModel({ source: 'ise', xdl: XDL, xdlrc: dev, xdlrcMtime: 2 })).device.part, 'xc3s100etq144-4', 'changed');
  // two more grids: the first one dropped (parsed again), the second one kept
  await buildModel({ source: 'ise', xdl: XDL, xdlrc: XDLRC, xdlrcMtime: 1 });
  await buildModel({ source: 'ise', xdl: XDL, xdlrc: XDLRC, xdlrcMtime: 2 });
  assert.equal((await buildModel({ source: 'ise', xdl: XDL, xdlrc: dev, xdlrcMtime: 1 })).device.part, 'xc3s100etq144-4', 'dropped');
  await assert.rejects(buildModel({ source: 'ise', xdl: path.join(tmp, 'none.xdl'), xdlrc: XDLRC, xdlrcMtime: 1 }), /ENOENT/);
});

test('#4774 fpgaViewModel: built in the worker; the requests for one key share one build; an error fails its request only', async () => {
  const job = { source: 'ise', xdl: XDL, xdlrc: XDLRC, xdlrcMtime: 1 };
  const a = fpgaViewModel(job, 'k1'), b = fpgaViewModel(job, 'k1'), c = fpgaViewModel(job, 'k2');
  assert.equal(a, b, 'one build for one key');
  assert.notEqual(a, c);
  const want = await reference(XDL, XDLRC);
  assert.deepEqual(await a, want);
  assert.deepEqual(await c, want);
  assert.notEqual(fpgaViewModel(job, 'k1'), a, 'built again once done (the caller keeps the cache)');
  await assert.rejects(fpgaViewModel({ ...job, xdl: path.join(tmp, 'none.xdl') }, 'k3'), /ENOENT/);
  assert.deepEqual(await fpgaViewModel(job, 'k4'), want, 'the worker still answers');
  await stopFpgaViewWorker();
  assert.deepEqual(await fpgaViewModel(job, 'k5'), want, 'a stopped worker replaced');
});

test('#4774 GET fpga-view: a big device parsed while the server answers its other requests', async () => {
  assert.equal((await app.call('POST', '/projects', { name: 'Big' })).status, 200);
  const file = path.join(P.projectDir('Big'), 'silinx.json');
  await fs.writeFile(file, JSON.stringify({ ...JSON.parse(await fs.readFile(file, 'utf8')), top: 'top' }));
  const build = path.join(P.projectDir('Big'), 'build');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'top.ncd'), 'NCD');
  await fs.copyFile(XDL, path.join(build, 'top.xdl'));
  // an xdlrc of 1.5 million wire lines (as a real device's), which the parser reads through and skips
  const pad = '\t\t(pip TIOIS_X1Y3 OMUX0 -> OMUX_E2)\n'.repeat(1_500_000);
  await fs.writeFile(path.join(build, 'device.xdlrc'), (await fs.readFile(XDLRC, 'utf8')).replace(/(\t\(tile 0 1[^\n]*\n)/, `$1${pad}`));
  const t = new Date(2026, 0, 2);
  await fs.utimes(path.join(build, 'top.ncd'), new Date(2026, 0, 1), new Date(2026, 0, 1));
  await fs.utimes(path.join(build, 'top.xdl'), t, t);
  // the longest the server's thread is held during the request: a small part of the request's time
  let last = performance.now(), gap = 0;
  const tick = setInterval(() => { const now = performance.now(); gap = Math.max(gap, now - last); last = now; }, 2);
  const t0 = performance.now();
  const r = await app.call('GET', '/projects/Big/fpga-view');
  const took = performance.now() - t0;
  clearInterval(tick);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, await reference(XDL, path.join(build, 'device.xdlrc')));
  assert.ok(gap < took / 2, `the server's thread held ${Math.round(gap)} ms of the request's ${Math.round(took)} ms`);
});
