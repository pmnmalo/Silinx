// The open families' nextpnr and packer on the local server (#2444): YoWASP's package (@yowasp/nextpnr-ice40, the iCE40's;
// @yowasp/nextpnr-ecp5, the ECP5's, #2302; @yowasp/nextpnr-himbaechel-gowin, the Gowin's, #2303; @yowasp/nextpnr-himbaechel-gatemate, the GateMate's, #2431) when it is installed; else (the release zip leaves them out: tens of MB packed,
// every part's chip database) its tarball, at the version and the SHA-512 of package-lock.json, downloaded by the first run
// from npm's registry, checked and kept in ~/.silinx/nextpnr/ (SILINX_CONFIG_DIR overrides ~/.silinx), as nextpnr-spartan's
// chip databases are (#2329).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkIntegrity, untgz } from '../core/tgz.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MODULE = 'gen/bundle.js';
// the package's tarball, kept with its files: what they are checked against (#4740)
const TARBALL = '.silinx-package.tgz';
// the folders checked by this process
const verified = new Set();

/** The packages downloaded on first use: what they hold (the log's words), their size packed, their folder's name. */
export const OWN_TOOLS = {
  '@yowasp/nextpnr-ice40': { tools: 'nextpnr-ice40 and icepack', mb: 80, dir: 'nextpnr-ice40' },
  '@yowasp/nextpnr-ecp5': { tools: 'nextpnr-ecp5 and ecppack', mb: 30, dir: 'nextpnr-ecp5' },
  '@yowasp/nextpnr-himbaechel-gowin': { tools: 'nextpnr-himbaechel-gowin and gowin_pack', mb: 32, dir: 'nextpnr-himbaechel-gowin' },
  '@yowasp/nextpnr-himbaechel-gatemate': { tools: 'nextpnr-himbaechel-gatemate and gmpack', mb: 4, dir: 'nextpnr-himbaechel-gatemate' },
};
const ICE40 = '@yowasp/nextpnr-ice40';
const toolOf = name => OWN_TOOLS[name] || { tools: name, mb: '?', dir: name.split('/').pop() };

/** { version, url, integrity } of a package in a package-lock.json; null when it has none. */
export function ownPackage(name, lockFile = path.join(ROOT, 'package-lock.json')) {
  try {
    const e = JSON.parse(fs.readFileSync(lockFile, 'utf8')).packages[`node_modules/${name}`];
    return e?.resolved && e.integrity ? { version: e.version, url: e.resolved, integrity: e.integrity } : null;
  } catch { return null; }
}

/** The folder of a package's version's files. */
export const ownCacheDir = (name, version) => path.join(process.env.SILINX_CONFIG_DIR || path.join(os.homedir(), '.silinx'), 'nextpnr', `${toolOf(name).dir}-${version}`);

/** Is a package there without a download: installed, or kept by an earlier run? */
export function ownPresent(name, pkg = ownPackage(name)) {
  try { import.meta.resolve(name); return true; } catch { /* not installed */ }
  return !!pkg && fs.existsSync(path.join(ownCacheDir(name, pkg.version), MODULE));
}

/**
 * A package's module: the installed one, the one kept, or downloaded and kept. log(line) says the download; offline, an
 * error that says what to do.
 */
export async function loadOwn(name, { log = () => {}, fetchFn = fetch, pkg = ownPackage(name), installed = () => import(name) } = {}) {
  try {
    return await installed();
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
  const { tools, mb } = toolOf(name), short = tools.split(' ')[0];
  if (!pkg) throw new Error(`${short} is not installed: npm install ${name}`);
  const dir = ownCacheDir(name, pkg.version), mod = path.join(dir, MODULE);
  // a folder kept by an earlier run is checked against package-lock.json's SHA-512 before its code runs (#4740): its
  // tarball's, kept beside it, then every file of the tarball against the one on disk; a file changed is written anew
  // from the tarball, a tarball changed (or none: a folder of an earlier version of Silinx) downloaded again
  if (fs.existsSync(mod) && !verified.has(dir)) {
    const { why, files, bytes } = await keptMismatch(dir, pkg);
    if (why === 'tarball') fs.rmSync(dir, { recursive: true, force: true });
    else if (why) {
      log(`Place & Route: ${short}'s files kept in ${dir} are not those of its package (${why}): written again from it`);
      writeKept(dir, files, bytes);
    }
  }
  if (!fs.existsSync(mod)) {
    log(`Place & Route: downloading ${tools} (about ${mb} MB, from ${new URL(pkg.url).host}: once, then kept in ${dir})…`);
    let bytes;
    try {
      const response = await fetchFn(pkg.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) {
      throw new Error(`${short} is not in this installation and could not be downloaded from ${pkg.url} (${e.message}): connect to the Internet once`);
    }
    try { await checkIntegrity(bytes, pkg.integrity); } catch (e) { throw new Error(`${short} downloaded from ${pkg.url}: ${e.message}: not used`); }
    const files = await untgz(bytes);
    if (!files[MODULE]) throw new Error(`${short} downloaded from ${pkg.url}: no ${MODULE}`);
    writeKept(dir, files, bytes);
  }
  verified.add(dir);
  return import(pathToFileURL(mod).href);
}

/** { why, files, bytes }: why the folder `dir` kept is not the package `pkg` ('tarball': its tarball missing or not of
 *  package-lock.json's SHA-512; else the first file of the tarball missing or changed on disk; '' when it is), and the
 *  tarball checked and its files. */
async function keptMismatch(dir, pkg) {
  let bytes;
  try { bytes = new Uint8Array(fs.readFileSync(path.join(dir, TARBALL))); await checkIntegrity(bytes, pkg.integrity); } catch { return { why: 'tarball' }; }
  const files = await untgz(bytes);
  for (const [n, data] of Object.entries(files)) {
    let disk;
    try { disk = fs.readFileSync(path.join(dir, n)); } catch { return { why: `${n} missing`, files, bytes }; }
    if (!disk.equals(Buffer.from(data))) return { why: `${n} changed`, files, bytes };
  }
  return { why: '', files, bytes };
}

/** A package's files and its tarball written to `dir`: whole, then renamed, so a run stopped half way leaves nothing that
 *  looks kept. */
function writeKept(dir, files, tarball) {
  const tmp = `${dir}.${process.pid}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [n, data] of Object.entries(files)) {
    const f = path.join(tmp, n);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  }
  fs.writeFileSync(path.join(tmp, TARBALL), tarball);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
}

/** A file of a package (its path from the package's folder): the installed package's, else the one kept; null when neither has
 *  it (the Gowin's resources, read by Silinx's gowin_pack, #2303). */
export function ownPackageFile(name, file, pkg = ownPackage(name)) {
  const dirs = [];
  try { dirs.push(path.dirname(path.dirname(fileURLToPath(import.meta.resolve(name))))); } catch { /* not installed */ }
  if (pkg) dirs.push(ownCacheDir(name, pkg.version));
  for (const d of dirs) {
    const f = path.join(d, file);
    if (fs.existsSync(f)) return new Uint8Array(fs.readFileSync(f));
  }
  return null;
}

// the iCE40's (#2444), as they were
/** { version, url, integrity } of the iCE40's package in a package-lock.json; null when it has none. */
export const ice40Package = lockFile => ownPackage(ICE40, lockFile);
/** The folder of a version's files. */
export const ice40CacheDir = version => ownCacheDir(ICE40, version);
/** Is it there without a download: installed, or kept by an earlier run? */
export const ice40Present = (pkg = ice40Package()) => ownPresent(ICE40, pkg);
/** The package's module: the installed one, the one kept, or downloaded and kept. */
export const loadIce40 = (o = {}) => loadOwn(ICE40, o);
