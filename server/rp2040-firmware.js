// Silinx - the RP2040 node's firmware on the local server (#5494, core/rp2040-firmware.js): MicroPython's .uf2 and the
// RP2040's bootrom, which Silinx does not ship, downloaded by their first use from their pinned addresses, checked against
// their SHA-256 and kept in ~/.silinx/rp2040/ (SILINX_CONFIG_DIR overrides ~/.silinx; SILINX_RP2040_CACHE names the
// folder itself, the tests' shared one), as the open families' nextpnr is (server/nextpnr-ice40-fetch.js). The server's
// simulations read them here (core/system-sim-rp2040.js setRp2040Source), the page at /vendor/rp2040/<file>.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RP2040_FILES, rp2040File, wordsBytes } from '../core/rp2040-firmware.js';
import { setRp2040Source } from '../core/system-sim-rp2040.js';

/** The folder the files are kept in. */
const rp2040Dir = () => process.env.SILINX_RP2040_CACHE || path.join(process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx'), 'rp2040');
const pending = new Map();

/** The path of the file `file` (one of RP2040_FILES, or of `files`: a test's), downloaded (`fetch`) and checked first when
 *  it is not kept yet; throws why not (no such file, the download failed, its SHA-256 not the pinned one). */
export function rp2040Path(file, { files = RP2040_FILES, fetch = globalThis.fetch } = {}) {
  const f = files === RP2040_FILES ? rp2040File(file) : files.find(x => x.file === file);
  if (!f) return Promise.reject(new Error(`no RP2040 firmware file '${file}' (${files.map(x => x.file).join(', ')})`));
  const to = path.join(rp2040Dir(), f.file);
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
  } catch (e) { throw new Error(`${f.what} could not be downloaded from ${f.url} (${e.message}): the RP2040 node needs it once`); }
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  if (sha !== f.sha256) throw new Error(`${f.what} downloaded from ${f.url} is not the one Silinx expects (its SHA-256 ${sha}, not ${f.sha256}): not used`);
  const bytes = f.words ? wordsBytes(new TextDecoder().decode(data)) : data;
  if (!bytes) throw new Error(`${f.what}: no words in ${f.url}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = `${to}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, to);
  return to;
}

/** The server's simulations read the firmware here (once, on its import). */
setRp2040Source(async file => new Uint8Array(await fs.promises.readFile(await rp2040Path(file))));
