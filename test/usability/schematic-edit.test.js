// Usability (#5148, part 2): the schematic's other edits as a person makes them: net names and I/O markers (their names
// typed in the box the tool asks with), copy and paste, a wire and a symbol deleted, Rearrange Wires and Rearrange
// Schematic on the gates example (examples/gates), and a half adder drawn from the palette on an empty sheet. After
// every step the drawing's invariants, the wires still attached, the nets; Check Schematic's warnings exactly; Undo
// back to the start and Redo to the end. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese
// (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { SchSession } from './lib/session.js';
import { nets } from './lib/sch-invariants.js';
import { newDoc } from '../../core/schdoc.js';
import { symbolPins } from '../../core/schdoc-symbols.js';

const FILE = 'test/usability/schematic-edit.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;

async function open(page, title, { template = 'gates', file = 'src/gates.sch.json', files } = {}) {
  const name = `UsabEdit${++n}`;
  await makeProject(env, { name, template: files ? 'empty' : template, files });
  await page.openProject(name);
  const s = new SchSession(page, env, { file: FILE, title });
  await s.open(file);
  return s;
}
const sameNets = (d, b) => {
  const [x, y] = [nets(d), nets(b)];
  assert.ok(JSON.stringify(x) === JSON.stringify(y), `the nets changed: now ${x.filter((q) => !y.includes(q)).join(' | ')}; before ${y.filter((q) => !x.includes(q)).join(' | ')}`);
};
const hasNet = (net) => (d) => assert.ok(nets(d).includes(net), `no net '${net}' (${nets(d).filter((x) => /inst_|port:x/.test(x)).join(' | ')})`);
/** Two inverters in the free strip of the gates example, wired: inst_1 (I 1300,1030; O 1380,1030) to inst_2 (I 1500,1030). */
async function twoInverters(s) {
  for (const [x, y] of [[1340, 1030], [1540, 1030]]) await s.step('place', { symbol: 'INV', x, y }, () => s.a.place('INV', x, y));
  await s.step('addWire', { from: 'inst_1.O', to: 'inst_2.I' }, () => s.a.addWire([[1380, 1030], [1500, 1030]]), { expect: hasNet('inst_1.O inst_2.I') });
}

uiTest('usability: schematic: a net name and I/O markers added, their names typed; the ports in the HDL; Undo, Redo', E, async (page) => {
  const s = await open(page, 'names and markers');
  const { a } = s;
  await twoInverters(s);
  await s.step('netName', { at: '(1440, 1030)', name: 'mid' }, () => a.netName(1440, 1030, 'mid'), {
    expect: (d, b) => { sameNets(d, b); assert.deepEqual(d.labels.filter((l) => l.net === 'mid').map((l) => `${l.x},${l.y}`), ['1440,1030']); },
  });
  await s.step('ioMarker', { at: 'inst_1.I', name: 'x_in' }, () => a.ioMarker(1300, 1030, 'x_in'), {
    expect: (d) => { hasNet('inst_1.I port:x_in')(d); assert.equal(d.ports.find((p) => p.name === 'x_in').dir, 'in'); },
  });
  await s.step('ioMarker', { at: 'inst_2.O', name: 'x_out' }, () => a.ioMarker(1580, 1030, 'x_out'), {
    expect: (d) => { hasNet('inst_2.O port:x_out')(d); assert.equal(d.ports.find((p) => p.name === 'x_out').dir, 'out'); },
  });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: schematic: two wired inverters copied and pasted: the copy wired the same, new names; Undo, Redo', E, async (page) => {
  const s = await open(page, 'copy and paste');
  const { a } = s;
  await twoInverters(s);
  await s.step('copyPaste', { names: ['inst_1', 'inst_2'], at: '(1440, 1070)' }, () => a.copyPaste(['inst_1', 'inst_2'], 1440, 1070), {
    expect: (d, b) => {
      assert.equal(d.symbols.length, b.symbols.length + 2);
      const added = d.symbols.filter((x) => !b.symbols.some((y) => y.id === x.id)).map((x) => x.name).sort();
      assert.equal(added.length, 2);
      assert.ok(nets(d).includes(`${added[0]}.O ${added[1]}.I`) || nets(d).includes(`${added[1]}.O ${added[0]}.I`), `the copy's wire: ${nets(d).filter((x) => /inst_/.test(x)).join(' | ')}`);
    },
  });
  await s.undoRedo();
});

uiTest('usability: schematic: a wire deleted, then a wired symbol: their nets said by Check Schematic; Undo, Redo', E, async (page) => {
  const s = await open(page, 'delete');
  const { a } = s;
  // inv_c's output wire to and_p1 (W11: 380,340 570,340 570,790): deleted, inv_c's output and and_p3's input then open
  // (its net name left on nothing, and the stretch past it to and_p3 left dangling: said)
  await s.step('deleteWire', { at: '(470, 340)' }, () => a.deleteWire(470, 340), { expect: (d, b) => assert.ok(d.wires.length < b.wires.length) });
  await s.warnings([
    "WARNING: net name 'c_n' is not attached to a wire",
    "WARNING: dangling wire (net 'c_n') not connected to any pin",
    'WARNING: input pin I1 of and_p3 (and3) is not connected',
    'WARNING: and_p3: input I1 unconnected, tied to 0',
  ]);
  // inv_b, its wires on its pins freed
  await s.step('deleteSymbol', { name: 'inv_b' }, () => a.deleteSymbol('inv_b'), {
    frees: (after, before) => {
      const pins = new Set(symbolPins(before.symbols.find((x) => x.name === 'inv_b')).map((p) => `${p.x},${p.y}`));
      return before.wires.filter((w) => [w.points[0], w.points.at(-1)].some((p) => pins.has(`${p.x},${p.y}`))).map((w) => w.id);
    },
    expect: (d, b) => assert.equal(d.symbols.length, b.symbols.length - 1),
  });
  // (b_n, its output's net, now driven by nothing)
  await s.warnings([
    "WARNING: net name 'c_n' is not attached to a wire",
    "WARNING: net 'b_n' has no driver (read by and_p1.I1, and_p4.I0)",
    "WARNING: dangling wire (net 'c_n') not connected to any pin",
    'WARNING: input pin I1 of and_p3 (and3) is not connected',
    'WARNING: and_p3: input I1 unconnected, tied to 0',
  ]);
  await s.undoRedo();
});

uiTest('usability: schematic: Rearrange Wires and Rearrange Schematic on the gates example: the nets kept, no clash; Undo, Redo', E, async (page) => {
  const s = await open(page, 'rearrange');
  const { a } = s;
  await s.step('rearrange', { act: 'rewire' }, () => a.rearrange('rewire'), { expect: sameNets });
  await s.step('rearrange', { act: 'relayout' }, async () => {
    const before = JSON.stringify(await a.getDoc());
    await a.rearrange('relayout');
    // (the layout answers later, ELK's)
    await page.waitFor(async () => true);
    for (let i = 0; i < 100 && JSON.stringify(await a.getDoc()) === before; i++) await new Promise((r) => setTimeout(r, 100));
  }, { expect: sameNets });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: schematic: a half adder drawn from the palette on an empty sheet, its markers named; its nets and HDL', E, async (page) => {
  const s = await open(page, 'half adder', { file: 'src/ha.sch.json', files: { 'src/ha.sch.json': JSON.stringify(newDoc('ha', 'vhdl')) } });
  const { a } = s;
  // XOR2 and AND2 one above the other; their inputs joined by two wires with T-junctions, a marker on each end
  await s.step('place', { symbol: 'XOR', x: 300, y: 200 }, () => a.place('XOR', 300, 200));
  await s.step('place', { symbol: 'AND', x: 300, y: 320 }, () => a.place('AND', 300, 320));
  const pins = async (name) => Object.fromEntries(symbolPins((await a.getDoc()).symbols.find((x) => x.name === name)).map((p) => [p.name, [p.x, p.y]]));
  const x = await pins('inst_1'), g = await pins('inst_2');
  // the inputs: from the left, a to both I1, b to both I0 (each a wire with a bend, the second one's start on the first)
  await s.step('addWire', { from: '(160, x.I1)', to: 'xor.I1' }, () => a.addWire([[160, x.I1[1]], x.I1]), { stubs: 1 });
  await s.step('addWire', { from: '(200, x.I0)', to: 'xor.I0' }, () => a.addWire([[200, x.I0[1]], x.I0]), { stubs: 1 });
  await s.step('addWire', { from: 'a\'s wire', to: 'and.I1' }, () => a.addWire([[180, x.I1[1]], [180, g.I1[1]], g.I1]));
  await s.step('addWire', { from: 'b\'s wire', to: 'and.I0' }, () => a.addWire([[220, x.I0[1]], [220, g.I0[1]], g.I0]));
  await s.step('ioMarker', { at: '(160, x.I1)', name: 'a' }, () => a.ioMarker(160, x.I1[1], 'a'));
  await s.step('ioMarker', { at: '(200, x.I0)', name: 'b' }, () => a.ioMarker(200, x.I0[1], 'b'), { frees: [] });
  await s.step('ioMarker', { at: 'xor.O', name: 's' }, () => a.ioMarker(...x.O, 's'));
  await s.step('ioMarker', { at: 'and.O', name: 'c' }, () => a.ioMarker(...g.O, 'c'));
  assert.deepEqual(nets(s.doc), ['inst_1.I0 inst_2.I0 port:b', 'inst_1.I1 inst_2.I1 port:a', 'inst_1.O port:s', 'inst_2.O port:c']);
  await s.warnings([]);
  await s.undoRedo();
});
