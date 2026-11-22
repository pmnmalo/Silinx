// Usability (#5206, phase 4): a design's hierarchy as a person goes up and down it: a top schematic (Verilog) holding
// a schematic module mid (VHDL) that holds a Verilog module cell. The instance of mid double-clicked (its schematic
// opened), the instance of cell in it double-clicked (its HDL opened), a port c added to cell (its lines typed), saved;
// back up by mid's tab: its instance out of date, Update Symbol, c wired to a new marker, saved (mid's HDL made again,
// now with c); back up by the top's tab: mid's instance out of date in its turn, and the top's own instance of cell,
// each updated, c wired, saved (the top's HDL made again, elaborated with the whole hierarchy). After every step the schematic's invariants, its HDL in
// VHDL and Verilog compiled with the modules below it and elaborated (the project's files on disk, lib/hier-kit.js),
// the instances up to date once updated, the console's lines exactly, the Design pane's hierarchy; Undo to the start
// and Redo to the end in each editor. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese
// (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { HdlSession } from './lib/hdl-session.js';
import { DiskSession, hierSchKit, sameLines, staleInstances, diskFiles, topErrors, modulesOf } from './lib/hier-kit.js';
import { hierActions, hdlText } from './lib/hier-actions.js';
import { consoleCount, designRows } from './lib/project-actions.js';
import { tr } from './lib/hdl-actions.js';
import { same } from './lib/project-session.js';
import { nets } from './lib/sch-invariants.js';
import { newDoc, normalizeDoc } from '../../core/schdoc.js';
import { symbolPins } from '../../core/schdoc-symbols.js';

const FILE = 'test/usability/hierarchy.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CELL = (ports, expr) => `module cell (\n  ${ports}\n  output y\n);\n  assign y = ${expr};\nendmodule\n`;
const PORTS = (names) => [...names.map((n) => ({ name: n, dir: 'in', width: 1 })), { name: 'y', dir: 'out', width: 1 }];
const HIER = ['▲top', '  u_c2 - cell', '  u_mid - mid', '    u_cell - cell'];
const OUT = { W: [-60, 0], E: [60, 0], S: [0, 60], N: [0, -60] };

/** A schematic `name` in `lang` holding the instances `insts` ([instance, module, its inputs, its y, the suffix of
 *  its markers' names]), a wire from each pin to an I/O marker named as the pin (and the suffix). */
function holder(name, lang, insts) {
  const d = newDoc(name, lang);
  insts.forEach(([inst, module, inputs, y, sfx = ''], k) => {
    const ports = PORTS(inputs), s = { id: `S${k + 1}`, type: 'module', x: 300, y, rot: 0, mirror: false, name: inst, params: { module, generics: {}, ports } };
    d.symbols.push(s);
    for (const p of symbolPins(s, { [module]: { name: module, ports } })) {
      const [dx, dy] = OUT[p.side], b = { x: p.x + dx, y: p.y + dy };
      d.wires.push({ id: `W_${p.name}${sfx}`, points: [{ x: p.x, y: p.y }, b] });
      d.ports.push({ id: `P_${p.name}${sfx}`, name: `${p.name}${sfx}`, dir: p.dir === 'out' ? 'out' : 'in', width: 1, x: b.x, y: b.y });
    }
  });
  return JSON.stringify(normalizeDoc(d));
}

/** A wire from the pin `p` of the instance `inst` straight out to a new I/O marker named as the pin (and `sfx`). */
async function wireOut(s, ctx, inst, p, sfx = '') {
  const q = symbolPins(s.doc.symbols.find((x) => x.name === inst), ctx.modules).find((x) => x.name === p), [dx, dy] = OUT[q.side];
  await s.step('addWire', { from: `${inst}.${p}` }, () => s.a.addWire([[q.x, q.y], [q.x + dx, q.y + dy]]), { stubs: 1 });
  await s.step('ioMarker', { at: 'its end', name: `${p}${sfx}` }, () => s.a.ioMarker(q.x + dx, q.y + dy, `${p}${sfx}`));
}

/** The nets of the instances `insts` ([instance, below, suffix]) whose pins `to` are wired to markers of their names,
 *  `open` unconnected (as nets() gives them, sorted). */
const wired = (insts, to, open = []) => insts.flatMap(([inst, , sfx = '']) => [...to.map((p) => [`${inst}.${p}`, `port:${p}${sfx}`].sort().join(' ')), ...open.map((p) => `${inst}.${p}`)]).sort();

/** The project's files once the schematic's HDL is made again (saved): its module's ports `ports`, waited for. */
async function madeAgain(name, module, ports) {
  let files;
  for (let k = 0; k < 50; k++) {
    files = await diskFiles(env, name);
    if (modulesOf(files)[module]?.ports.length === ports.length) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  same(modulesOf(files)[module]?.ports.map((x) => x.name).sort(), ports, `${module}'s ports`);
  return files;
}

uiTest('usability: hierarchy: down from the top to a schematic module and its HDL module, a port added there, each level updated and made again on the way up; Undo, Redo', E, async (page) => {
  const name = 'UsabHier';
  await makeProject(env, { name, top: 'top', files: {
    'src/cell.v': CELL('input a, b,', 'a & b'),
    'src/mid.sch.json': holder('mid', 'vhdl', [['u_cell', 'cell', ['a', 'b'], 200]]),
    // (the top holds an instance of cell too: cell's change updated in both schematics that use it)
    'src/top.sch.json': holder('top', 'verilog', [['u_mid', 'mid', ['a', 'b'], 200], ['u_c2', 'cell', ['a', 'b'], 400, '2']]),
  } });
  await page.setViewport(1440, 900);
  await page.openProject(name);
  const ctx = { modules: {}, sources: {} };
  let n = await consoleCount(page);
  // (the console's lines from here on; an Undo to the start and Redo leave theirs, as symbols.test.js says)
  const mark = async () => { n = await consoleCount(page); };
  const lines = (want) => async () => { await sameLines(page, n, want); n = await consoleCount(page); };
  const kit = { ...hierSchKit(ctx), actions: hierActions };
  // (the Design pane's hierarchy: its rows' names, their depth, the top marked)
  const rows = async (want) => same((await designRows(page)).map((r) => r.replace(/ \[.*$/, '')), want, 'the Design pane\'s rows');

  const top = new DiskSession(page, env, { file: FILE, title: 'hierarchy: top', ctx, project: name, kit });
  await top.open('src/top.sch.json');
  await rows(HIER);
  await mark();
  const a = top.a;

  // down: mid's schematic, then cell's HDL
  same(await a.descend('u_mid'), 'sch:src/mid.sch.json', 'opened');
  await lines([])();
  const mid = new DiskSession(page, env, { file: FILE, title: 'hierarchy: mid', ctx, project: name, kit });
  mid.docs.push(await mid.settled());
  same(await a.descend('u_cell'), 'file:src/cell.v', 'opened');
  await lines([])();

  // cell: a port c added, its lines typed; Undo, Redo; saved
  const hdl = new HdlSession(page, env, { file: FILE, title: 'hierarchy: cell' });
  hdl.docs.push(await hdlText(page));
  let text = CELL('input a, b,', 'a & b');
  for (const [line, from, to] of [[2, 'input a, b,', 'input a, b, c,'], [5, 'assign y = a & b;', 'assign y = a & b | c;']]) {
    text = text.replace(from, to);
    const want = text;
    await hdl.step('replace a line', { line, text: to }, () => a.replaceLine(line, to), { expect: (d) => same(d, want, 'the text') });
  }
  await hdl.undoRedo();
  await mark();
  await hdl.step('save', {}, () => a.save(), { changes: false, expect: lines([]) });

  // up to mid (its tab): its instance of cell out of date; Update Symbol; c wired to a marker; Undo, Redo; saved, its
  // HDL made again with c. Then up to the top: mid's instance out of date in its turn, and the top's own instance of
  // cell: each updated and wired; saved, the top's HDL made again, elaborated with the hierarchy below it
  const up = async (s, file, module, insts, ports) => {
    await a.tab(file);
    await mark();
    for (const [inst, below] of insts) {
      await s.step('Update Symbol', { instance: inst }, async () => { s.note = await a.updateSymbol(inst); }, {
        expect: async (d) => {
          same(s.note, (await tr(page, [`The symbol is out of date: module '${below}' changed its ports (added c).`]))[0], 'the note');
          same(staleInstances(d, ctx.modules).filter((x) => x.startsWith(`${inst} `)), [], 'out of date');
          // (its console line: the connections kept, #5277; its text in the page's language)
          const [said] = await tr(page, [`Symbol updated (${inst}), its connections kept`]);
          await lines([`${file}: ${said}`])();
        },
      });
    }
    same(nets(s.doc, { modules: ctx.modules }), wired(insts, ['a', 'b', 'y'], ['c']), 'the nets');
    await s.warnings(insts.map(([inst, below]) => `WARNING: input pin c of ${inst} (${below}) is not connected`));
    await mark();
    for (const [inst, , sfx] of insts) await wireOut(s, ctx, inst, 'c', sfx);
    same(nets(s.doc, { modules: ctx.modules }), wired(insts, ['a', 'b', 'c', 'y']), 'the nets');
    await s.warnings([]);
    await mark();
    await s.undoRedo();
    await mark();
    await s.step('save', {}, () => a.save(), {
      changes: false,
      expect: async () => { same(topErrors(await madeAgain(name, module, ports), module), [], `${module} elaborated`); await lines([])(); },
    });
  };
  await up(mid, 'mid.sch.json', 'mid', [['u_cell', 'cell']], ['a', 'b', 'c', 'y']);
  await up(top, 'top.sch.json', 'top', [['u_mid', 'mid'], ['u_c2', 'cell', '2']], ['a', 'a2', 'b', 'b2', 'c', 'c2', 'y', 'y2']);
  await rows(HIER);
}, { timeout: 240000 });
