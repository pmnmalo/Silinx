// @silinx/avr-gcc (#5934): an Arduino Uno's or Nano's sketch built to its .hex in the browser or in Node, by Arduino's own
// avr-gcc 7.3.0 and binutils compiled to WebAssembly (the package's dist/tools/), with Arduino's sysroot (dist/sysroot/) and
// its AVR core, Wire and SPI precompiled (dist/arduino/). Isomorphic, no dependency: the caller gives the package's files
// (`read(path)`: a dist/ file's bytes, as Silinx's loader keeps them), each tool runs in a WebAssembly instance of its own
// on a file system in memory.
//
//   const gcc = await createAvrGcc({ read: (p) => fs.promises.readFile(new URL(`../dist/${p}`, import.meta.url)) });
//   const r = await gcc.buildSketch({ files: { 'blink.ino': 'void setup() {}\nvoid loop() {}\n' } });
//   r.ok, r.hex, r.size, r.messages, r.log
import { compileSteps, linkSteps, BOARDS, ARDUINO_CORE } from './flags.js';
import { sketchCpp } from './sketch.js';

export { BOARDS, ARDUINO_CORE, compileSteps, linkSteps } from './flags.js';
export { sketchCpp, inoFunctions } from './sketch.js';

const TOOLS = ['cc1', 'cc1plus', 'as', 'ld', 'ar', 'objcopy'];
// a tool's files: the compilers read the headers, the linker the libraries
const NEEDS = { cc1: /^(sysroot\/(gcc\/include|gcc\/include-fixed|avr\/include)|arduino\/(core|variants|libraries)\/)/, ld: /^(sysroot\/(avr\/lib|gcc\/lib|ldscripts)|arduino\/lib\/)/ };
NEEDS.cc1plus = NEEDS.cc1;
const SOURCE = /\.(c|cpp|cc|cxx|S)$/;

/** A tool's factory from its module's text (a classic Emscripten module, createTool): a function of its text, as Silinx's
 *  pages run the YoWASP bundles (no Blob script under its Content-Security-Policy); in Node, its require given. */
function factoryOf(text, require) {
  // (its #! line, Node's, is no JavaScript of a function's body)
  return new Function('require', '__filename', '__dirname', `${text.replace(/^#!.*/, '')}\n;return createTool;`)(require, '/tool.js', '/');
}

/**
 * The toolchain: { buildSketch, compile, run } over the package's files. read(path) gives a dist/ file's bytes (a
 * Promise or not); require: Node's (createRequire), so that the tools' module runs there.
 */
export async function createAvrGcc({ read, require }) {
  // (in Node, the tools' module requires fs and path: Node's require given to it)
  if (!require && globalThis.process?.versions?.node) require = (await import('node:module')).createRequire(import.meta.url);
  const bytes = async (p) => { const b = await read(p); if (!b) throw new Error(`@silinx/avr-gcc: no ${p} in the package`); return b instanceof Uint8Array ? b : new Uint8Array(b); };
  const manifest = JSON.parse(new TextDecoder().decode(await bytes('manifest.json')));
  const tools = {};
  async function tool(name) {
    if (!tools[name]) {
      const [js, wasm] = await Promise.all([bytes(`tools/${name}.js`), bytes(`tools/${name}.wasm`)]);
      tools[name] = { factory: factoryOf(new TextDecoder().decode(js), require), module: await WebAssembly.compile(wasm), files: null };
    }
    const t = tools[name];
    if (!t.files) t.files = NEEDS[name] ? await Promise.all(manifest.files.filter((f) => NEEDS[name].test(f)).map(async (f) => [`/${f}`, await bytes(f)])) : [];
    return t;
  }

  /** One tool run in /w with `work` (path → bytes or text): { code, log, work (its files after the run) }. */
  async function run(name, args, work) {
    const t = await tool(name), log = [];
    const m = await t.factory({
      print: (s) => log.push(s), printErr: (s) => { if (!/^warning: unsupported syscall/.test(s)) log.push(s); },
      instantiateWasm: (imports, done) => { WebAssembly.instantiate(t.module, imports).then((i) => done(i)); return {}; },
    });
    for (const [p, b] of t.files) { m.FS.mkdirTree(p.slice(0, p.lastIndexOf('/'))); m.FS.writeFile(p, b); }
    m.FS.mkdirTree('/w');
    for (const [p, b] of Object.entries(work)) { if (p.includes('/')) m.FS.mkdirTree(`/w/${p.slice(0, p.lastIndexOf('/'))}`); m.FS.writeFile(`/w/${p}`, b); }
    m.FS.chdir('/w');
    let code;
    try { code = m.callMain([...args]); } catch (e) { code = typeof e?.status === 'number' ? e.status : (log.push(String(e?.message || e)), 1); }
    const out = {};
    const walk = (d, rel) => { for (const e of m.FS.readdir(d)) { if (e === '.' || e === '..') continue; const p = `${d}/${e}`, r = rel ? `${rel}/${e}` : e; if (m.FS.isDir(m.FS.stat(p).mode)) walk(p, r); else out[r] = m.FS.readFile(p); } };
    walk('/w', '');
    return { code, log: log.join('\n'), work: out };
  }

  /** A source (`src`, in `work`) compiled to its object `obj`: { ok, log, work }. */
  async function compile(src, obj, work, options = {}) {
    let log = '', files = work;
    for (const step of compileSteps(src, obj, options)) {
      const r = await run(step.tool, step.args, files);
      log += r.log ? `${r.log}\n` : '';
      files = r.work;
      if (r.code !== 0) return { ok: false, log, work: files };
    }
    return { ok: true, log, work: files };
  }

  /**
   * A sketch built: files (its folder's: name → text; .ino joined, .c / .cpp / .S compiled, .h included), main (its main
   * .ino: the first else), board ('arduino-uno', 'arduino-nano'). { ok, hex, size (the flash's bytes), data (the RAM's static
   * bytes), log (the tools' messages, the sketch's files and lines; then arduino-cli's two lines of its sizes, and its
   * "Sketch too big" or "Not enough memory" past the board's), cpp (the .ino made C++) }.
   */
  async function buildSketch({ files, main = null, board = 'arduino-uno', fcpu = '16000000L' }) {
    if (!BOARDS[board]) throw new Error(`@silinx/avr-gcc: no board '${board}' (${Object.keys(BOARDS).join(', ')})`);
    const names = Object.keys(files).sort();
    const inos = names.filter((n) => /\.ino$/.test(n));
    const first = main && inos.includes(main) ? main : inos[0];
    const enc = (t) => (typeof t === 'string' ? new TextEncoder().encode(t) : t);
    let work = Object.fromEntries(names.map((n) => [n, enc(files[n])]));
    let cpp = null;
    const sources = names.filter((n) => SOURCE.test(n));
    if (first) {
      cpp = sketchCpp([first, ...inos.filter((n) => n !== first)].map((n) => ({ name: n, text: new TextDecoder().decode(work[n]) })));
      work[cpp.name] = enc(cpp.cpp);
      sources.unshift(cpp.name);
    }
    if (!sources.length) return { ok: false, hex: null, size: 0, log: 'no .ino, C or C++ file to build', cpp: null };
    let log = '';
    const objs = [];
    for (const src of sources) {
      const obj = `${src.replace(/[^\w.-]/g, '_')}.o`;
      const r = await compile(src, obj, work, { board, fcpu });
      log += r.log; work = r.work;
      if (!r.ok) return { ok: false, hex: null, size: 0, log, cpp: cpp?.cpp ?? null };
      objs.push(obj);
    }
    // the core's and the libraries' archives (an archive's member linked only when the sketch uses it)
    // (the sketch's objects in their names' order, as arduino-cli links them: counter.cpp.o before multi.ino.cpp.o)
    objs.sort();
    const archives = ['/arduino/lib/Wire.a', '/arduino/lib/SPI.a', '/arduino/lib/core.a'];   // (the libraries before the core they call)
    for (const step of linkSteps(objs, archives)) {
      const r = await run(step.tool, step.args, work);
      log += r.log ? `${r.log}\n` : '';
      work = r.work;
      if (r.code !== 0) return { ok: false, hex: null, size: 0, log, cpp: cpp?.cpp ?? null };
    }
    const hex = new TextDecoder().decode(work['sketch.hex']);
    // (the sizes arduino-cli checks after the link, its words: the flash's upload, the RAM's static data)
    const size = hexSize(hex), data = dataSize(work['sketch.elf']), b = BOARDS[board];
    log += `Sketch uses ${size} bytes (${Math.round((100 * size) / b.flash)}%) of program storage space. Maximum is ${b.flash} bytes.\n`
      + `Global variables use ${data} bytes (${Math.round((100 * data) / b.ram)}%) of dynamic memory, leaving ${b.ram - data} bytes for local variables. Maximum is ${b.ram} bytes.\n`;
    if (size > b.flash) return { ok: false, hex: null, size, log: `${log}Sketch too big: ${size} bytes, the most ${board} takes is ${b.flash}\n`, cpp: cpp?.cpp ?? null };
    if (data > b.ram) return { ok: false, hex: null, size, log: `${log}Not enough memory: ${data} bytes of static data, ${board} has ${b.ram}\n`, cpp: cpp?.cpp ?? null };
    return { ok: true, hex, size, data, log, cpp: cpp?.cpp ?? null };
  }
  return { buildSketch, compile, run, manifest, core: ARDUINO_CORE, tools: TOOLS };
}

/** The RAM an ELF's sections take (.data, .bss, .noinit: arduino-cli's recipe.size.regex.data). */
function dataSize(elf) {
  const v = new DataView(elf.buffer, elf.byteOffset, elf.byteLength), sh = v.getUint32(32, true), n = v.getUint16(48, true), str = v.getUint16(50, true);
  const at = (i) => sh + i * 40, names = v.getUint32(at(str) + 16, true);
  let total = 0;
  for (let i = 0; i < n; i++) {
    let name = '', o = names + v.getUint32(at(i), true);
    while (elf[o]) name += String.fromCharCode(elf[o++]);
    if (['.data', '.bss', '.noinit'].includes(name)) total += v.getUint32(at(i) + 20, true);
  }
  return total;
}

/** The bytes an Intel HEX's data records hold. */
function hexSize(hex) {
  let n = 0;
  for (const l of String(hex).split(/\r?\n/)) if (/^:[0-9A-Fa-f]{10}/.test(l) && l.slice(7, 9) === '00') n += parseInt(l.slice(1, 3), 16);
  return n;
}
