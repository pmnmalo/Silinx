// Silinx - Silinx's MicroPython build for the ESP32 node's JSPI back end on the local server (#5658,
// core/micropython-jspi.js): downloaded by its first use from its release, checked against its SHA-256 and kept in
// ~/.silinx/micropython-jspi/<release>/ (SILINX_CONFIG_DIR overrides ~/.silinx; SILINX_MICROPYTHON_JSPI_CACHE names the
// folder itself, the tests'), as the RP2040's firmware is (server/rp2040-firmware.js). The server's simulations load it
// from here (setEsp32JspiLoader, where Node has JSPI), the page at /vendor/micropython-jspi/<file>.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MICROPYTHON_JSPI_FILES, MICROPYTHON_JSPI_RELEASE } from '../core/micropython-jspi.js';
import { setEsp32JspiLoader } from '../core/system-sim-esp32.js';

const jspiDir = () => process.env.SILINX_MICROPYTHON_JSPI_CACHE || path.join(process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx'), 'micropython-jspi', MICROPYTHON_JSPI_RELEASE);
const pending = new Map();

/** The path of the build's file `file` (or of `files`: a test's), downloaded (`fetch`) and checked first when it is not
 *  kept yet; throws why not (no such file, the download failed, its SHA-256 not the pinned one). */
export function micropythonJspiPath(file, { files = MICROPYTHON_JSPI_FILES, fetch = globalThis.fetch } = {}) {
  const f = files.find(x => x.file === file);
  if (!f) return Promise.reject(new Error(`no file '${file}' in Silinx's MicroPython build (${files.map(x => x.file).join(', ')})`));
  const to = path.join(jspiDir(), f.file);
  if (fs.existsSync(to)) return Promise.resolve(to);
  if (!pending.has(file)) pending.set(file, download(f, to, fetch).finally(() => pending.delete(file)));
  return pending.get(file);
}

// the file downloaded, checked, and written whole (then renamed: a download stopped half way leaves nothing)
async function download(f, to, fetch) {
  let data;
  try {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = new Uint8Array(await r.arrayBuffer());
  } catch (e) { throw new Error(`${f.what} could not be downloaded from ${f.url} (${e.message}): the ESP32 node's JSPI back end needs it once`); }
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  if (sha !== f.sha256) throw new Error(`${f.what} downloaded from ${f.url} is not the one Silinx expects (its SHA-256 ${sha}, not ${f.sha256}): not used`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = `${to}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, to);
  return to;
}

/** The server's simulations load the build here (once, on its import). */
setEsp32JspiLoader(async () => {
  const [mjs, wasm] = await Promise.all(['micropython.mjs', 'micropython.wasm'].map(f => micropythonJspiPath(f)));
  return { ...(await import(pathToFileURL(mjs).href)), url: wasm };
});
