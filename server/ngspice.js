// ngspice on the local server and the MCP server (#5386, the analog and digital roadmap #5387): eecircuit-engine, its
// WebAssembly build (its wrapper MIT, ngspice BSD-3-Clause: NOTICE, THIRD-PARTY-NOTICES), pinned, never shipped nor a
// dependency: its tarball downloaded by the first use from npm's registry, its SHA-256 checked, kept in ~/.silinx/ngspice/
// (SILINX_CONFIG_DIR overrides ~/.silinx) and checked again by each process before its code runs, as the open families'
// nextpnr are (server/nextpnr-ice40-fetch.js). It runs in a worker thread of its own (server/ngspice-worker.js): its
// Emscripten code sets globalThis.window, which the server's own code must not see. Optional: the circuits' own solver
// (core/circuit-analog.js, #5382) stays the default; core/circuit-spice.js writes the netlist and reads the result.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { untgz } from '../core/tgz.js';

/** The engine pinned: its npm package and version, its tarball's URL and SHA-256, its size packed (MB). */
export const NGSPICE = {
  package: 'eecircuit-engine', version: '1.9.0', mb: 11,
  url: 'https://registry.npmjs.org/eecircuit-engine/-/eecircuit-engine-1.9.0.tgz',
  sha256: '6f93beb7169be618311d7edba336ea97ad662142fc5f6d22c1da7ecb6eefee6a',
};
// (followed by the monthly Pins workflow, scripts/check-pins.mjs, #5649: a newer version on npm, the tarball served changed)
const UPDATE = 'NGSPICE\'s version, URL and SHA-256 (of the tarball: shasum -a 256), NOTICE and THIRD-PARTY-NOTICES if its licences changed, then test/ngspice.test.js';
export const PINNED = [
  { kind: 'npm', name: 'ngspice (eecircuit-engine, its WebAssembly build)', package: NGSPICE.package, version: NGSPICE.version, update: UPDATE },
  { kind: 'sha256', name: 'ngspice (eecircuit-engine\'s tarball)', url: NGSPICE.url, sha256: NGSPICE.sha256, update: UPDATE },
];

const MODULE = 'dist/eecircuit-engine.mjs';
const TARBALL = 'eecircuit-engine.tgz';   // (kept beside its module: what it is checked against)
const verified = new Set();               // (the folders checked by this process)
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The folder of a version's files. */
export const ngspiceDir = (pin = NGSPICE) => path.join(process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx'), 'ngspice', `${pin.package}-${pin.version}`);
/** Is it there without a download (kept by an earlier run)? */
export const ngspicePresent = (pin = NGSPICE) => fs.existsSync(path.join(ngspiceDir(pin), MODULE));

/**
 * The engine's module file: the one kept (its tarball's SHA-256 and the module the tarball's, checked once a process),
 * else downloaded, checked and kept. log(line) says the download; offline or a wrong file, an error that says what to do.
 */
export async function ngspiceModule({ log = () => {}, fetchFn = fetch, pin = NGSPICE } = {}) {
  const dir = ngspiceDir(pin), mod = path.join(dir, MODULE);
  if (fs.existsSync(mod) && !verified.has(dir)) {
    let ok = false;
    try {
      const tgz = fs.readFileSync(path.join(dir, TARBALL));
      ok = sha256(tgz) === pin.sha256 && Buffer.from((await untgz(new Uint8Array(tgz)))[MODULE] ?? []).equals(fs.readFileSync(mod));
    } catch { /* not kept whole */ }
    if (!ok) {
      log(`ngspice: the files kept in ${dir} are not those of ${pin.package} ${pin.version}: downloaded again`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (!fs.existsSync(mod)) {
    log(`ngspice: downloading ${pin.package} ${pin.version} (about ${pin.mb} MB, from ${new URL(pin.url).host}: once, then kept in ${dir})…`);
    let bytes;
    try {
      const response = await fetchFn(pin.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) {
      throw new Error(`ngspice is not in this installation and could not be downloaded from ${pin.url} (${e.message}): connect to the Internet once`);
    }
    if (sha256(bytes) !== pin.sha256) throw new Error(`ngspice downloaded from ${pin.url}: its SHA-256 is not the one pinned: not used`);
    const files = await untgz(bytes);
    if (!files[MODULE]) throw new Error(`ngspice downloaded from ${pin.url}: no ${MODULE}`);
    // (written whole, then renamed: a run stopped half way leaves nothing that looks kept)
    const tmp = `${dir}.${process.pid}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(path.join(tmp, path.dirname(MODULE)), { recursive: true });
    fs.writeFileSync(path.join(tmp, MODULE), files[MODULE]);
    fs.writeFileSync(path.join(tmp, TARBALL), bytes);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  }
  verified.add(dir);
  return mod;
}

/**
 * An ngspice of its own: { run(netlist) → { result (eecircuit-engine's: { dataType, data: [{ name, values }] }), errors,
 * info }, close() }, its runs one at a time in its worker thread. log, fetchFn, pin: ngspiceModule's.
 */
export async function createNgspice(o = {}) {
  const mod = await ngspiceModule(o);
  const worker = new Worker(new URL('./ngspice-worker.js', import.meta.url), { workerData: { module: pathToFileURL(mod).href } });
  const waiting = new Map();
  let next = 0, failed = null;
  // (the thread holds the process only while a run waits for it: a server's or a test's kept idle lets it end)
  worker.unref();
  const settle = () => { if (!waiting.size) worker.unref(); };
  const fail = (e) => { failed = e; for (const w of waiting.values()) w.reject(e); waiting.clear(); };
  worker.on('message', ({ id, error, ...out }) => { const w = waiting.get(id); waiting.delete(id); settle(); if (error) w?.reject(new Error(`ngspice: ${error}`)); else w?.resolve(out); });
  worker.on('error', (e) => fail(new Error(`ngspice: ${e.message}`)));
  worker.on('exit', (code) => fail(new Error(`ngspice stopped (${code})`)));
  return {
    run(netlist) {
      if (failed) return Promise.reject(failed);
      const id = ++next;
      worker.ref();
      return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); worker.postMessage({ id, netlist }); });
    },
    close: () => { worker.removeAllListeners('exit'); return worker.terminate(); },
  };
}

let shared = null;
/** The process's ngspice, started by its first run (its runs one at a time); a failed start tried again by the next. */
export async function runNgspice(netlist, o = {}) {
  shared ??= createNgspice(o).catch((e) => { shared = null; throw e; });
  return (await shared).run(netlist);
}
