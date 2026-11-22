// Usability (#5206, phase 4): a module's symbol as a person makes it and keeps it in step with its module, in VHDL and
// in Verilog: Edit Symbol of the module's row of the Design pane (its default symbol made), a pin taken to the bottom
// by its Side, one moved along its side (Later ▶), the body made wider; saved; the module placed in the top's schematic
// from its palette, a wire from each pin to an I/O marker; the instance double-clicked, its HDL opened, a port renamed
// and one added (their lines typed), saved; the Symbol Editor again (the new pins added, the renamed one's old pin
// dropped, said), one new pin moved up (◀ Earlier), the other dragged above it; Update Symbol in the schematic: the
// wires on the pins kept stay on them, following them, the renamed pin's wire left unconnected (Check Schematic's
// warnings exactly), that wire and its marker deleted, the new pins wired. After
// every step: the schematic's invariants (lib/sch-invariants.js), its HDL in VHDL and Verilog compiled with the
// module's and elaborated, the symbol's pins the module's ports (the project's files on disk, lib/hier-kit.js), the
// console's lines exactly; Undo to the start and Redo to the end in each editor. In both interfaces
// (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from '../ui/harness.js';
import { HdlSession } from './lib/hdl-session.js';
import { DiskSession, hierSchKit, sameLines, staleInstances, diskFiles, topErrors, modulesOf } from './lib/hier-kit.js';
import { symKit } from './lib/sym-actions.js';
import { hierActions, hdlText } from './lib/hier-actions.js';
import { consoleCount } from './lib/project-actions.js';
import { tr } from './lib/hdl-actions.js';
import { same } from './lib/project-session.js';
import { nets } from './lib/sch-invariants.js';
import { newDoc } from '../../core/schdoc.js';
import { symbolPins } from '../../core/schdoc-symbols.js';

const FILE = 'test/usability/symbols.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the module, a 2-to-1 multiplexer: its HDL, the lines a person changes (b renamed c, an enable en added) and how
const PICK = {
  vhdl: {
    file: 'src/pick.vhd',
    text: (ports, sel) => `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity pick is\n  port (\n    ${ports}\n    y : out std_logic\n  );\nend entity pick;\n\narchitecture rtl of pick is\nbegin\n  ${sel}\nend architecture rtl;\n`,
    before: ['a, b, s : in std_logic;', "y <= b when s = '1' else a;"],
    after: ['a, c, s, en : in std_logic;', "y <= c when s = '1' and en = '1' else a;"],
    lines: [6, 13],
  },
  verilog: {
    file: 'src/pick.v',
    text: (ports, sel) => `module pick (\n  ${ports}\n  output y\n);\n  ${sel}\nendmodule\n`,
    before: ['input a, b, s,', 'assign y = s ? b : a;'],
    after: ['input a, c, s, en,', 'assign y = s & en ? c : a;'],
    lines: [2, 5],
  },
};
/** A wire from each pin of `names` straight out (`out`: by its side) to its end, an I/O marker named as the pin there. */
async function wireOut(s, at, names, out) {
  for (const p of names) {
    const q = at[p], [dx, dy] = out[q.side];
    await s.step('addWire', { from: `inst_1.${p}`, out: q.side }, () => s.a.addWire([[q.x, q.y], [q.x + dx, q.y + dy]]), { stubs: 1 });
    await s.step('ioMarker', { at: `inst_1.${p}'s wire's end`, name: p }, () => s.a.ioMarker(q.x + dx, q.y + dy, p));
  }
}
const pins = (sym) => sym.pins.map((q) => `${q.name}:${q.side}`);
const MADE = "src/pick.sym.json: the symbol of module 'pick' made (its default one): its pins' order and sides edited in the Symbol Editor";

// the Symbol Editor's edits once the HDL changed ([action, pin, its argument, the pins after it]): c moved up (◀
// Earlier), en dragged above it (the left side's pins: en where b was, a moved down a place); or en to the bottom
// beside s (s moved along the bottom, its wire following, #5278); then the new pins wired
const LEFT = { edits: [['Earlier', 'c', -1, ['c:W', 'a:W', 'y:E', 's:S', 'en:W']], ['drag', 'en', 'c', ['en:W', 'c:W', 'a:W', 'y:E', 's:S']]], connect: [['wire', 'en'], ['marker', 'c']] };
const BOTTOM = { edits: [['Side', 'en', 'S', ['a:W', 'y:E', 's:S', 'en:S', 'c:W']], ['drag', 'c', 'a', ['c:W', 'a:W', 'y:E', 's:S', 'en:S']]], connect: [['wire', 'c'], ['marker', 'en']] };
let k = 0;

/** The whole session in `lang`: `v` the second symbol's edits and the new pins' wiring (LEFT, BOTTOM), `says` the
 *  console's lines of Update Symbol. */
async function symbols(page, lang, { title, v, says = [] }) {
  const P = PICK[lang];
  const name = `UsabSym${++k}`;
  await makeProject(env, { name, top: 'top', files: { [P.file]: P.text(...P.before), 'src/top.sch.json': JSON.stringify(newDoc('top', lang)) } });
  await page.setViewport(1440, 900);
  await page.openProject(name);
  const ctx = { modules: {}, sources: {} };
  let n = await consoleCount(page);
  // (the console's lines from here on; an Undo to the start and Redo leave theirs: the documents saved on the way, as
  // their autosave comes, say their HDL made or not from the drawing as it was then)
  const mark = async () => { n = await consoleCount(page); };
  const lines = (want) => async () => { await sameLines(page, n, want); n = await consoleCount(page); };

  // the symbol made by Edit Symbol of the module's row: its default one, the inputs on the left, the output on the right
  const sym = new DiskSession(page, env, { file: FILE, title: `${title}: symbol`, ctx, project: name, kit: symKit(env, ctx), hdl: false });
  await sym.open('pick');
  assert.deepEqual(pins(sym.doc), ['a:W', 'b:W', 's:W', 'y:E']);
  await lines([MADE])();
  const sa = sym.a;
  await sym.step('Side', { pin: 's', side: 'S' }, () => sa.side('s', 'S'), { expect: async (d) => { same(pins(d), ['a:W', 'b:W', 'y:E', 's:S'], 'the pins'); await lines([])(); } });
  await sym.step('Later', { pin: 'a' }, () => sa.shift('a', 1), { expect: (d) => same(pins(d), ['b:W', 'a:W', 'y:E', 's:S'], 'the pins') });
  await sym.step('Width', { width: 100 }, () => sa.size('width', 100), { expect: async (d) => { same([d.width, /^100 × \d+$/.test((await sa.status())[1])], [100, true], 'the width, the status line\'s'); } });
  await sym.undoRedo();
  await mark();
  await sym.step('save', {}, () => sa.save(), { changes: false, expect: async (d) => { same(JSON.parse(await readWs(env, name, 'src/pick.sym.json')), d, 'the symbol on disk'); await lines([])(); } });
  await sa.exit();
  await lines([])();

  // the top's schematic: the module placed from its palette (its symbol's layout), a wire from each pin to an I/O
  // marker named as the pin
  const sch = new DiskSession(page, env, { file: FILE, title: `${title}: schematic`, ctx, project: name, kit: { ...hierSchKit(ctx), actions: hierActions } });
  await sch.open('src/top.sch.json');
  const a = sch.a;
  await sch.step('place', { symbol: 'pick', x: 300, y: 200 }, () => a.place('pick', 300, 200), {
    expect: (d) => same(d.symbols.map((x) => `${x.name}:${x.params.module}:${x.params.ports.map((q) => `${q.name}${q.side}`).join(',')}`), ['inst_1:pick:bW,aW,yE,sS'], 'the instance'),
  });
  const at = (d) => Object.fromEntries(symbolPins(d.symbols[0], ctx.modules).map((q) => [q.name, q]));
  const out = { W: [-60, 0], E: [60, 0], S: [0, 60], N: [0, -60] };
  await wireOut(sch, at(sch.doc), ['a', 'b', 's', 'y'], out);
  assert.deepEqual(nets(sch.doc, { modules: ctx.modules }), ['inst_1.a port:a', 'inst_1.b port:b', 'inst_1.s port:s', 'inst_1.y port:y']);
  await sch.warnings([]);
  await mark();
  await sch.undoRedo();
  await mark();
  await sch.step('save', {}, () => a.save(), { changes: false, expect: lines([]) });

  // the instance double-clicked: its module's HDL in its editor; b renamed c and an enable en added, their lines
  // typed; Undo to the text opened and Redo; saved
  assert.equal(await a.descend('inst_1'), `file:${P.file}`);
  await lines([])();
  const hdl = new HdlSession(page, env, { file: FILE, title: `${title}: HDL` });
  hdl.docs.push(await hdlText(page));
  let text = P.text(...P.before);
  for (const k of [0, 1]) {
    text = text.replace(P.before[k], P.after[k]);
    const want = text;
    await hdl.step('replace a line', { line: P.lines[k], text: P.after[k] }, () => a.replaceLine(P.lines[k], P.after[k]), { expect: (d) => same(d, want, 'the text') });
  }
  await hdl.undoRedo();
  await mark();
  await hdl.step('save', {}, () => a.save(), { changes: false, expect: lines([]) });

  // the Symbol Editor again: the new ports' pins added on the left, the renamed one's old pin dropped (said); its
  // edits; Undo, Redo; saved
  const sym2 = new DiskSession(page, env, { file: FILE, title: `${title}: symbol updated`, ctx, project: name, kit: symKit(env, ctx), hdl: false });
  await sym2.open('pick');
  assert.deepEqual(pins(sym2.doc), ['a:W', 'y:E', 's:S', 'c:W', 'en:W']);
  await lines(["WARNING: pick: pins added for the module's new ports: c, en", "WARNING: pick: pins removed, the module has no such ports any more: b"])();
  for (const [act, pin, arg, want] of v.edits) {
    await sym2.step(act, { pin, arg }, () => (act === 'drag' ? sym2.a.drag(pin, arg) : act === 'Side' ? sym2.a.side(pin, arg) : sym2.a.shift(pin, arg)), { expect: (d) => same(pins(d), want, 'the pins') });
  }
  await sym2.undoRedo();
  await mark();
  await sym2.step('save', {}, () => sym2.a.save(), { changes: false, expect: async (d) => { same(JSON.parse(await readWs(env, name, 'src/pick.sym.json')), d, 'the symbol on disk'); await lines([])(); } });
  await sym2.a.exit();
  await lines([])();

  // the schematic: its instance out of date; Update Symbol: the pins in the symbol's places, the wires of a, s and y
  // following theirs, b's wire left unconnected, pulled back from en's pin, now where b's was (said); c and en open
  await a.tab('top.sch.json');
  await mark();
  const bWire = sch.doc.wires.find((w) => w.points.some((q) => q.x === at(sch.doc).b.x && q.y === at(sch.doc).b.y));
  await sch.step('Update Symbol', { instance: 'inst_1' }, async () => { sch.note = await a.updateSymbol('inst_1'); }, {
    frees: [bWire.id],
    expect: async (d) => {
      same(sch.note, (await tr(page, ["The symbol is out of date: module 'pick' changed its ports (added c, en; removed b)."]))[0], 'the note');
      same(staleInstances(d, ctx.modules), [], 'out of date');
      same(d.symbols[0].params.ports.map((q) => `${q.name}:${q.side}`), v.edits.at(-1)[3], 'the instance\'s pins');
      same(nets(d, { modules: ctx.modules }), ['inst_1.a port:a', 'inst_1.c', 'inst_1.en', 'inst_1.s port:s', 'inst_1.y port:y', 'port:b'], 'the nets');
      // (#5277: what Update Symbol says is flashed on the canvas, not a console line: the todo below)
      await lines(says)();
    },
  });
  await sch.warnings(["WARNING: input pin en of inst_1 (pick) is not connected", "WARNING: input pin c of inst_1 (pick) is not connected", "WARNING: I/O marker 'b' is not connected"]);
  await mark();
  // b's wire and its marker deleted (a click on its segment's middle, on the marker's body); the new pins wired: a wire
  // to a marker, or a marker on the pin (`v.connect`); Undo to the start, Redo; saved
  const q = at(sch.doc), bw = sch.doc.wires.find((w) => w.id === bWire.id).points, bm = sch.doc.ports.find((x) => x.name === 'b');
  await sch.step('deleteWire', { wire: bWire.id }, () => a.deleteWire((bw[0].x + bw[1].x) / 2, (bw[0].y + bw[1].y) / 2), { expect: (d, b) => same(d.wires.length, b.wires.length - 1, 'the wires') });
  await sch.step('delete marker', { name: 'b' }, async () => { await a.selectAt(bm.x - 15, bm.y); await page.key('Delete'); }, { expect: (d) => same(d.ports.map((x) => x.name).sort(), ['a', 's', 'y'], 'the markers') });
  for (const [how, p] of v.connect) {
    if (how === 'wire') await wireOut(sch, q, [p], out);
    else await sch.step('ioMarker', { at: `inst_1.${p}`, name: p }, () => a.ioMarker(q[p].x, q[p].y, p));
  }
  same(nets(sch.doc, { modules: ctx.modules }), ['inst_1.a port:a', 'inst_1.c port:c', 'inst_1.en port:en', 'inst_1.s port:s', 'inst_1.y port:y'], 'the nets');
  await sch.warnings([]);
  await mark();
  await sch.undoRedo();
  await mark();
  // (the top's HDL made again from it: its ports the schematic's markers, elaborated with the module changed)
  await sch.step('save', {}, () => a.save(), {
    changes: false,
    expect: async () => {
      // (made once the schematic is saved: waited for)
      let files;
      for (let k = 0; k < 50; k++) {
        files = await diskFiles(env, name);
        if (modulesOf(files).top?.ports.length === 5) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      same(topErrors(files, 'top'), [], 'the top elaborated');
      same(modulesOf(files).top?.ports.map((x) => x.name).sort(), ['a', 'c', 'en', 's', 'y'], 'the top\'s ports');
      await lines([])();
    },
  });
}

for (const lang of ['vhdl', 'verilog']) {
  uiTest(`usability: symbols: ${lang}: a module's symbol made and edited, placed and wired; its HDL changed, the symbol and the instance updated, the wires kept; Undo, Redo`, E, async (page) => {
    await symbols(page, lang, { title: `symbols ${lang}`, v: LEFT });
  }, { timeout: 240000 });
}

// (#5277: Update Symbol's "not connected any more" flashed on the canvas, never in the console)
uiTest('usability: symbols: Update Symbol says the pin it leaves unconnected in the console (#5277)', E, async (page, _env, t) => {
  t.todo('#5277: "Symbol updated; not connected any more: inst_1.b" only flashed on the canvas');
  await symbols(page, 'vhdl', { title: 'symbols: Update Symbol said', v: LEFT, says: ['WARNING: top.sch.json: Symbol updated; not connected any more: inst_1.b'] });
}, { timeout: 240000 });

// (#5278: a pin that moves along the bottom side: its wire follows over its I/O marker's body)
uiTest('usability: symbols: Update Symbol moves s along the bottom, its wire following clear of its marker (#5278)', E, async (page, _env, t) => {
  t.todo('#5278: s\'s wire bent at its marker, along the marker\'s body');
  await symbols(page, 'vhdl', { title: 'symbols: a bottom pin moved', v: BOTTOM });
}, { timeout: 240000 });
