// UI: the 7-series in the browser edition (#3143). The site built (test/ui/site-lib.js) and served over HTTP; a new project
// from an example on the Basys 3 (its XDC made for the board), Generate Programming File in the browser: Yosys's synth_xilinx,
// nextpnr-himbaechel-xc7 (its bundle and the xc7a35t's chip database, the xc7a50t's, from the site's assets/vendor/nextpnr-xc7)
// with router2 as the local server's, the .bit written from nextpnr's FASM on Project X-Ray's bit database (bitdb/xc7, gzipped);
// no warning, and the .bit downloaded: byte for byte the local server's flow's for the same project (server/open-flow.js), but
// the header's date and time. blinky, and vga (a larger design: the VGA timing and its pattern). On the Nexys A7 too (#3669): the
// xc7a100t's chip database, its own, and router2 there (about 2.1 GB of WebAssembly memory, test/nextpnr-xc7-memory.test.js).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupUi, uiTest, waitDownload } from './harness.js';
import { buildSite } from './site-lib.js';
import { runOpenImplementation } from '../../server/open-flow.js';
import { parseBitHeader } from '../../server/programmer.js';
import { exampleProject } from '../examples-lib.mjs';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

// the local server's flow on the same project (the example on the board, the XDC the browser's wizard wrote): its .bit
async function serverBit(name, board, xdc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-web-'));
  try {
    const { dir, project } = exampleProject(name, { board }, tmp);
    fs.writeFileSync(path.join(dir, project.constraints), xdc);
    const lines = [];
    await runOpenImplementation({ log: (l) => lines.push(l), procs: new Set(), cancelled: false }, { project, projectDir: dir, steps: ['bitgen'] });
    assert.deepEqual(lines.join('\n').split('\n').filter((l) => /WARNING|ERROR/.test(l)), [], 'the server\'s flow');
    return fs.readFileSync(path.join(dir, `build/${project.top}.bit`));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// File ▸ New Project… from an example on a board
async function newProject(page, name, template, board) {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', template, { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', board, { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
}
// the boards: the part, its package, its chip database (the xc7a35t's: the xc7a50t's), another part's not fetched
const BOARDS = {
  basys3: { name: 'Digilent Basys 3', device: { family: 'artix7', part: 'xc7a35t', package: 'cpg236', speed: '-1' }, part: 'xc7a35tcpg236-1', bitPart: '7a35tcpg236', other: 'xc7a100t' },
  'nexys-a7': { name: 'Digilent Nexys A7', device: { family: 'artix7', part: 'xc7a100t', package: 'csg324', speed: '-1' }, part: 'xc7a100tcsg324-1', bitPart: '7a100tcsg324', other: 'xc7a50t' },
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// what a run on the Basys 3 fetches from the site's assets but Yosys (its URLs, as the site serves them); on the Nexys A7, its
// part's bit database and chip database (nextpnr is the Basys 3's, kept)
const XC7_A100T_ASSETS = [/(?:^|\/)assets\/dev-[0-9a-f]+\/bitdb\/xc7\/xc7a100tcsg324-1\.json\.gz$/, /(?:^|\/)assets\/vendor\/nextpnr-xc7\/[\d.]+\/chipdb\/chipdb-xc7a100t\.bin\.gz$/];
const XC7_ASSETS = [/(?:^|\/)assets\/dev-[0-9a-f]+\/bitdb\/xc7\/xc7a35tcpg236-1\.json\.gz$/, /(?:^|\/)assets\/vendor\/nextpnr-xc7\/[\d.]+\/chipdb\/chipdb-xc7a50t\.bin\.gz$/,
  /(?:^|\/)assets\/vendor\/nextpnr-xc7\/[\d.]+\/gen\/nextpnr-himbaechel-xilinx\.core\.wasm$/, /(?:^|\/)assets\/vendor\/nextpnr-xc7\/[\d.]+\/gen\/nextpnr-himbaechel-xilinx-resources\.0\.tar$/];
// the project's XDC, as its editor shows it, once the wizard has made it for the board (its console line) and the editor is open
// (not as soon as the project opens: on a slower machine the file and its editor come later, #3143's CI)
async function constraintsText(page, before, board) {
  await page.waitFor((b, n) => new RegExp(`^constraints/\\w+\\.xdc regenerated for ${n}: `, 'm').test(window.__console().slice(b)), [before, board.name], { what: `the XDC made for the ${board.name}`, timeout: 60000 });
  await page.eval(async () => window.SilinxApp.openFile(window.Silinx.project.constraints));
  await page.waitFor(() => /^# XDC for top/m.test(window.SilinxApp.findDoc(`file:${window.Silinx.project.constraints}`)?.editor?.getValue() || ''), [], { what: 'the XDC\'s editor', timeout: 60000 });
  return page.eval(() => window.SilinxApp.findDoc(`file:${window.Silinx.project.constraints}`).editor.getValue());
}

for (const [example, top, id, issue] of [['blinky', 'top', 'basys3', 3143], ['vga', 'vga', 'basys3', 3143], ['blinky', 'top', 'nexys-a7', 3669], ['vga', 'vga', 'nexys-a7', 3669]]) {
  const board = BOARDS[id];
  uiTest(`#${issue} browser edition: Generate Programming File of ${example} on the ${board.name.replace('Digilent ', '')} runs the 7-series' flow in the browser, no warnings, the local server's .bit`, E, async (page) => {
    await page.goto(site.url);
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
    const name = `Web7${example}${id === 'basys3' ? '' : 'A7'}`, opened = site.served.length, booted = (await page.consoleText()).length;
    await newProject(page, name, example, id);
    assert.deepEqual(await page.eval(() => [window.Silinx.project.device, window.Silinx.project.synthTool]), [board.device, 'silinx']);
    const xdc = await constraintsText(page, booted, board);
    const d = board.device;
    assert.match(xdc, new RegExp(`^# XDC for top '\\w+' on ${board.name} \\(${d.part}${d.speed}-${d.package}\\), generated by Silinx`, 'm'));
    // in the background, once the project opened (#967): the part's bit database, nextpnr-himbaechel-xc7 and the part's chip
    // database (the xc7a35t's: the xc7a50t's) into Cache Storage, beside Yosys
    const assets = id === 'basys3' ? XC7_ASSETS : [...XC7_A100T_ASSETS, ...XC7_ASSETS.slice(2)];
    await page.waitFor((w) => caches.open('silinx-assets').then((c) => c.keys()).then((ks) => w.every((p) => ks.some((k) => new RegExp(p).test(k.url)))), [assets.map((r) => r.source)], { what: 'the assets prefetched', timeout: 60000 });
    await page.setView('impl');
    const served = site.served.length, before = (await page.consoleText()).length;
    await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
    await page.waitConsole(/=== SILINX (DONE|FAILED)/, { timeout: 300000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-3000)}`); });
    await page.waitFor(() => !window.Silinx.busy, [], { what: 'flow finished', timeout: 30000 });
    const log = (await page.consoleText()).slice(before);
    assert.doesNotMatch(log, /SILINX FAILED|Process failed/, log.slice(-3000));
    const part = esc(board.part);
    for (const re of [new RegExp(`device=${part}`), new RegExp(`Loading the bit database of ${part}…`), /=== SILINX STEP synth ===/,
      new RegExp(`Loading nextpnr and the chip database of ${part} \\(WebAssembly, about 6 MB: once, then kept by this browser\\)…`),
      new RegExp(`nextpnr-himbaechel \\(xilinx\\) places and routes <${top}> on the ${part} \\(router2\\)\\.`),
      /Clock clk: [\d.]+ MHz \(met, 100 MHz asked; nextpnr's estimate\)/, /=== SILINX STEP bitgen ===/,
      // (compressed: the board's XDC sets BITSTREAM.GENERAL.COMPRESS, #3876)
      new RegExp(`Bitstream: build/${top}\\.bit \\(\\d{6} bytes, compressed, from nextpnr's FASM on Project X-Ray's database\\)`),
      /=== SILINX DONE ===/, /Process "Generate Programming File" completed successfully/]) assert.match(log, re);
    // no warnings: none in the flow's lines, none in the Errors and Warnings
    assert.deepEqual(log.split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
    assert.deepEqual(await page.eval(() => window.Silinx.diags.filter((d) => d.severity !== 'info').map((d) => d.message)), []);
    // the part's assets from the site, when the project opened: its bit database, nextpnr-himbaechel-xc7 and the xc7a50t's chip
    // database, no other family's nor the other part's (the board's first test's: the next one's are kept; nextpnr the Basys 3's);
    // the run fetched none of them, read from the cache
    const asked = site.served.slice(opened);
    if (example === 'blinky') for (const re of id === 'basys3' ? XC7_ASSETS : XC7_A100T_ASSETS) assert.ok(asked.some((p) => re.test(p)), `${re}: ${asked.filter((p) => /nextpnr|bitdb/.test(p)).join('\n')}`);
    assert.deepEqual(asked.filter((p) => new RegExp(`/devices/|/bitdb/(xc3s|s3e-|s6/)|nextpnr-spartan|chipdb-${board.other}`).test(p)), []);
    assert.deepEqual(site.served.slice(served).filter((p) => /\/(bitdb|chipdb)\/|\.wasm$/.test(p)), []);
    // the .bit: the local server's for the same project, byte for byte but its header's date and time
    const bit = fs.readFileSync(await waitDownload(page, `${top}.bit`)), ref = await serverBit(example, id, xdc);
    const h = parseBitHeader(bit), r = parseBitHeader(ref);
    assert.deepEqual([h.designName, h.userId, h.part, h.dataLength], [r.designName, r.userId, board.bitPart, r.dataLength]);
    assert.equal(bit.length, ref.length);
    assert.ok(bit.subarray(h.dataOffset).equals(ref.subarray(r.dataOffset)), 'the configuration data of the local server\'s flow');
  }, { url: () => 'about:blank', timeout: 400000 });
}
