// Usability (#5148): the schematic's wires as a person draws and moves them, on the gates example (examples/gates):
// symbols placed from the palette, wires drawn pin to pin, a T-junction on a wire, a loose end left; segments and
// symbols dragged with their wires (rubber band); a symbol's width and inputs changed in Properties. After every step
// the drawing's invariants (lib/sch-invariants.js), the wires still attached, the nets; Check Schematic's warnings
// exactly; Undo back to the start and Redo to the end. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese
// (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { SchSession } from './lib/session.js';
import { nets, junctionPoints } from './lib/sch-invariants.js';
import { wireClashes } from '../../core/schpath.js';

const FILE = 'test/usability/schematic-wires.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;

/** A session on a fresh copy of the gates example, its schematic open. */
async function gates(page, title) {
  const name = `UsabGates${++n}`;
  await makeProject(env, { name, template: 'gates' });
  await page.openProject(name);
  const s = new SchSession(page, env, { file: FILE, title });
  await s.open('src/gates.sch.json');
  return s;
}
const hasNet = (net) => (d) => assert.ok(nets(d).includes(net), `no net '${net}' (${nets(d).filter((x) => x.includes('inst_')).join(' | ')})`);
const sameNets = (d, b) => {
  const [x, y] = [nets(d), nets(b)];
  assert.ok(JSON.stringify(x) === JSON.stringify(y), `the nets changed: now ${x.filter((q) => !y.includes(q)).join(' | ')}; before ${y.filter((q) => !x.includes(q)).join(' | ')}`);
};

uiTest('usability: schematic: add wires: pin to pin, a T-junction on a wire, a loose end; the warnings; Undo, Redo', E, async (page) => {
  const s = await gates(page, 'add wires');
  const { a } = s;
  // three inverters in the free corner under the LEDs' join: inst_1 (I 1300,1030; O 1380,1030), inst_2 (I 1500,1030),
  // inst_3 (I 1500,1080), all on the sheet (1700 by 1100)
  for (const [x, y] of [[1340, 1030], [1540, 1030], [1540, 1080]]) {
    await s.step('place', { symbol: 'INV', x, y }, () => a.place('INV', x, y), { expect: (d, b) => assert.equal(d.symbols.length, b.symbols.length + 1) });
  }
  await s.step('addWire', { from: 'inst_1.O', to: 'inst_2.I' }, () => a.addWire([[1380, 1030], [1500, 1030]]), { expect: hasNet('inst_1.O inst_2.I') });
  // from the wire's middle down and across to inst_3's input: a T-junction, its dot drawn
  await s.step('addWire', { from: '(1440, 1030)', to: 'inst_3.I' }, () => a.addWire([[1440, 1030], [1440, 1080], [1500, 1080]]), {
    expect: async (d) => {
      hasNet('inst_1.O inst_2.I inst_3.I')(d);
      assert.ok(junctionPoints(d).includes('1440,1030'), 'a junction at (1440, 1030)');
      assert.ok((await a.dots()).includes('1440,1030'), 'its dot drawn');
    },
  });
  // from inst_2's output to nowhere, ended with Esc: a loose end, said by Check Schematic
  await s.step('addWire', { from: 'inst_2.O', to: '(1640, 1030)' }, () => a.addWire([[1580, 1030], [1640, 1030]]), { stubs: 1 });
  await s.warnings([
    "WARNING: net 'net_3' connects only inst_2.O",
    'WARNING: input pin I of inst_1 (inv) is not connected',
    'WARNING: inst_1: input I unconnected, tied to 0',
  ]);
  await s.undoRedo();
  assert.deepEqual(await a.dots(), junctionPoints(s.doc), 'the dots where three wires meet, after Redo');
});

uiTest('usability: schematic: move wires: a segment dragged, a T-junction\'s wire moved; the nets kept; Undo, Redo', E, async (page) => {
  const s = await gates(page, 'move wires');
  const { a } = s;
  // and_p2's output wire to or_sum (W29: 740,710 770,710 770,740 800,740): its vertical segment 10 to the left
  await s.step('moveSegment', { at: '(770, 725)', dx: -10 }, () => a.moveSegment(770, 725, -10, 0), {
    expect: (d, b) => {
      sameNets(d, b);
      assert.deepEqual(d.wires.find((w) => w.id === 'W29').points.map((p) => `${p.x},${p.y}`), ['740,710', '760,710', '760,740', '800,740']);
    },
  });
  // net a's vertical bus of taps (W70: 260,460 480,460 480,710): 20 to the left, the T-junctions on it following
  await s.step('moveSegment', { at: '(480, 600)', dx: -20 }, () => a.moveSegment(480, 600, -20, 0), { expect: sameNets });
  // and back 20 to the right
  await s.step('moveSegment', { at: '(460, 600)', dx: 20 }, () => a.moveSegment(460, 600, 20, 0), { expect: sameNets });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: schematic: move symbols with their wires: dragged; the wires follow, the nets kept; Undo, Redo', E, async (page) => {
  const s = await gates(page, 'move symbols');
  const { a } = s;
  await s.step('moveSymbol', { name: 'inv_b', dx: 20 }, () => a.moveSymbol('inv_b', 20, 0), { expect: sameNets });
  await s.step('moveSymbol', { name: 'inv_a', dx: 20, dy: 20 }, () => a.moveSymbol('inv_a', 20, 20), { expect: sameNets });
  await s.step('moveSymbol', { name: 'inv_b', dx: -20 }, () => a.moveSymbol('inv_b', -20, 0), { expect: sameNets });
  // a new inverter wired to two others, then dragged and rotated
  for (const [x, y] of [[1340, 1030], [1540, 1030]]) await s.step('place', { symbol: 'INV', x, y }, () => a.place('INV', x, y));
  await s.step('addWire', { from: 'inst_1.O', to: 'inst_2.I' }, () => a.addWire([[1380, 1030], [1500, 1030]]), { expect: hasNet('inst_1.O inst_2.I') });
  await s.step('moveSymbol', { name: 'inst_2', dx: 40, dy: 40 }, () => a.moveSymbol('inst_2', 40, 40), { expect: sameNets });
  await s.step('moveSymbol', { name: 'inst_1', dx: -40 }, () => a.moveSymbol('inst_1', -40, 0), { expect: sameNets });
  await s.warnings(['WARNING: input pin I of inst_1 (inv) is not connected', 'WARNING: inst_1: input I unconnected, tied to 0']);
  await s.undoRedo();
});

uiTest('usability: schematic: a symbol\'s width changed: its wires kept, the widths that no longer match said; Undo, Redo', E, async (page) => {
  const s = await gates(page, 'change a width');
  const { a } = s;
  // two inverters wired, both made 4 bits wide: the net 4 bits once both are
  for (const [x, y] of [[1340, 1030], [1540, 1030]]) await s.step('place', { symbol: 'INV', x, y }, () => a.place('INV', x, y));
  await s.step('addWire', { from: 'inst_1.O', to: 'inst_2.I' }, () => a.addWire([[1380, 1030], [1500, 1030]]));
  await s.step('setParam', { name: 'inst_1', width: 4 }, () => a.setParam('inst_1', 'width', 4), { expect: sameNets, errors: ["error: width mismatch on net 'net_2': 4 vs 1 bits"] });
  await s.step('setParam', { name: 'inst_2', width: 4 }, () => a.setParam('inst_2', 'width', 4), { expect: sameNets });
  // or_sum 4 bits wide among 1-bit nets: each of its nets said
  await s.step('setParam', { name: 'or_sum', width: 4 }, () => a.setParam('or_sum', 'width', 4), {
    expect: sameNets,
    errors: ["error: width mismatch on net 'p1': 1 vs 4 bits", "error: width mismatch on net 'p2': 1 vs 4 bits", "error: width mismatch on net 'p3': 1 vs 4 bits",
      "error: width mismatch on net 'p4': 1 vs 4 bits", "error: width mismatch on net 'prime_sop': 4 vs 1 bits"],
  });
  await s.step('setParam', { name: 'or_sum', width: 1 }, () => a.setParam('or_sum', 'width', 1), { expect: sameNets });
  await s.undoRedo();
});

uiTest('usability: schematic: a gate\'s inputs changed (OR4 to OR2): the wires of the pins kept follow them (#5153)', E, async (page) => {
  const s = await gates(page, 'change a gate\'s inputs');
  const { a } = s;
  await s.step('setParam', { name: 'or_sum', inputs: 2 }, () => a.setParam('or_sum', 'inputs', 2), {
    frees: ['W30', 'W31'],   // (the wires of I2 and I3, which go)
    expect: (d) => assert.equal(d.symbols.find((x) => x.name === 'or_sum').type, 'or2'),
  });
  // (and_p3's and and_p4's outputs now read by nothing)
  await s.warnings(["WARNING: net 'p3' connects only and_p3.O", "WARNING: net 'p4' connects only and_p4.O"]);
  await s.undoRedo();
});

uiTest('usability: schematic: a gate whose output carries its net\'s name moved: the name follows its wire (#5154)', E, async (page) => {
  const s = await gates(page, 'move a named output');
  await s.step('moveSymbol', { name: 'or_sum', dy: 40 }, () => s.a.moveSymbol('or_sum', 0, 40), { expect: sameNets });
  await s.step('moveSymbol', { name: 'nand_sum', dx: 40, dy: -20 }, () => s.a.moveSymbol('nand_sum', 40, -20), { expect: sameNets });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: schematic: a segment dragged onto another net\'s wire is not left overlapping it (#5155)', E, async (page) => {
  const s = await gates(page, 'segment onto another wire');
  // W29's vertical segment (x 770) 10 to the right, onto W28's (x 780, y 630 to 720)
  await s.step('moveSegment', { at: '(770, 725)', dx: 10 }, () => s.a.moveSegment(770, 725, 10, 0), {
    expect: (d, b) => { sameNets(d, b); assert.deepEqual(wireClashes(d).filter((c) => c.wire === 'W29'), [], 'W29 clear of the other wires'); },
  });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: schematic: a wired symbol rotated, mirrored: its wires stay on its pins (#5156)', E, async (page) => {
  const s = await gates(page, 'rotate a wired symbol');
  const { a } = s;
  for (const [x, y] of [[1340, 1030], [1540, 1030]]) await s.step('place', { symbol: 'INV', x, y }, () => a.place('INV', x, y));
  await s.step('addWire', { from: 'inst_1.O', to: 'inst_2.I' }, () => a.addWire([[1380, 1030], [1500, 1030]]));
  await s.step('rotate', { name: 'inst_2' }, () => a.rotate('inst_2'), { expect: sameNets });
  await s.step('rotate', { name: 'inst_2' }, () => a.rotate('inst_2'), { expect: sameNets });
  await s.step('mirror', { name: 'inst_2' }, () => a.mirror('inst_2'), { expect: sameNets });
  await s.step('mirror', { name: 'inst_1', act: 'mirrorv' }, () => a.mirror('inst_1', 'mirrorv'), { expect: sameNets });
  await s.step('rotate', { name: 'inst_1' }, () => a.rotate('inst_1'), { expect: sameNets });
  await s.warnings(['WARNING: input pin I of inst_1 (inv) is not connected', 'WARNING: inst_1: input I unconnected, tied to 0']);
  await s.undoRedo();
});

uiTest('usability: schematic: a symbol dragged, a wire drawn from it, then its Width changed: the change kept (#5159)', E, async (page) => {
  const s = await gates(page, 'width after a wire');
  const { a } = s;
  for (const [x, y] of [[1340, 1030], [1540, 1030]]) await s.step('place', { symbol: 'INV', x, y }, () => a.place('INV', x, y));
  await s.step('moveSymbol', { name: 'inst_1', dx: -20 }, () => a.moveSymbol('inst_1', -20, 0));
  await s.step('addWire', { from: 'inst_1.O', to: 'inst_2.I' }, () => a.addWire([[1360, 1030], [1500, 1030]]));
  await s.step('setParam', { name: 'inst_1', width: 4 }, () => a.setParam('inst_1', 'width', 4), { errors: ["error: width mismatch on net 'net_2': 4 vs 1 bits"] });
  await s.step('setParam', { name: 'inst_2', width: 4 }, () => a.setParam('inst_2', 'width', 4), { expect: sameNets });
  await s.warnings(['WARNING: input pin I of inst_1 (inv) is not connected', 'WARNING: inst_1: input I unconnected, tied to 0']);
  await s.undoRedo();
});
