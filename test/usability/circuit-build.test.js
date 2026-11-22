// Usability (#5148, part 3): a digital circuit built on the breadboard as a person builds it, on the breadboard example
// (examples/breadboard): an IC placed from the parts panel, powered with two wires to the rails, linked to the circuit
// by a wire from another IC's output; the breadboard dragged and turned with everything on it (the
// nets kept; a turn onto the leads of the parts beside it refused, #5162); a short circuit and a floating input made on purpose, said by Check, and undone. After every step the
// circuit's invariants (lib/circ-invariants.js: its check's errors, the wires that were attached still attached, the
// new wires' loose ends), the HDL in VHDL and Verilog; Check's warnings exactly; Undo back to the start and Redo to the
// end. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { CIRC_KIT } from './lib/circ-actions.js';
import { circNets } from './lib/circ-invariants.js';

const FILE = 'test/usability/circuit-build.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;

async function breadboard(page, title) {
  const name = `UsabCirc${++n}`;
  await makeProject(env, { name, template: 'breadboard' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, kit: CIRC_KIT });
  await s.open('src/breadboard.circ.json');
  return s;
}
const sameNets = (d, b) => {
  const [x, y] = [circNets(d), circNets(b)];
  assert.ok(JSON.stringify(x) === JSON.stringify(y), `the nets changed: now ${x.filter((q) => !y.includes(q)).join(' | ')}; before ${y.filter((q) => !x.includes(q)).join(' | ')}`);
};
const hasNet = (...pins) => (d) => assert.ok(circNets(d).some((net) => pins.every((p) => net.split(' ').includes(p))), `no net with ${pins.join(', ')}`);
const unpowered = (errs) => errs.every((e) => /is not powered/.test(e));

uiTest('usability: circuit: an IC placed, powered, linked to the circuit; Check\'s warnings; Undo, Redo', E, async (page) => {
  const s = await breadboard(page, 'build on the breadboard');
  const { a } = s;
  // a 7404 in the free columns 47–53, across the channel: pin 1 at (46, 7), pin 7 (GND) at (52, 7), pin 14 (VCC) at (46, 4)
  await s.step('place', { part: '7404', x: 46, y: 7 }, () => a.place('7404', 46, 7), {
    expect: (d, b) => assert.equal(d.parts.length, b.parts.length + 1),
    errors: ['error: U5 (7404) is not powered: its VCC (pin 14) is not on the supply\'s + and its GND (pin 7) is not on the supply\'s −'],
  });
  // its VCC: from its column's hole d47 to the top + rail; its GND: from h53 to the bottom − rail
  await s.step('addWire', { from: 'd47', to: 'tp47' }, () => a.addWire([[46, 3], [46, -4]]), { errors: unpowered });
  await s.step('addWire', { from: 'g53', to: 'bn53' }, () => a.addWire([[52, 8], [52, 14]]), { expect: hasNet('U5.7', 'U2.7') });
  // linked: the 7486's first output (U4 pin 3, column 41) to the 7404's first input (column 47)
  await s.step('addWire', { from: 'g41', to: 'g47' }, () => a.addWire([[40, 8], [46, 8]]), { expect: hasNet('U4.3', 'U5.1') });
  // (its other inputs open, as on the bench: no warning for an IC's unused gates)
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: circuit: the breadboard dragged with all on it: the wires follow, the nets kept; Undo, Redo', E, async (page) => {
  const s = await breadboard(page, 'move the breadboard');
  const { a } = s;
  // (grabbed by its channel at column 14, where no IC is)
  await s.step('movePart', { id: 'BB1', dx: 3, dy: 5 }, () => a.movePart('BB1', 3, 5, { grip: [13.4, 5.4] }), {
    expect: (d, b) => { sameNets(d, b); assert.deepEqual([d.parts[0].x, d.parts[0].y], [3, 5]); },
  });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: circuit: the breadboard turned (R) beside the parts: refused, said in the console; moved off them, turned with all on it, the nets kept (#5162)', E, async (page) => {
  const s = await breadboard(page, 'turn the breadboard');
  const { a } = s;
  // (clicked by its channel at column 14, where no IC is) its hole h11 would land under the button's lead: refused
  const said = async (msg) => {
    const n0 = (await page.consoleText()).length;
    await a.rotate('BB1', { grip: [13.4, 5.4] });
    // (in English or in the page's language: the editor's messages translated by #5164)
    const want = [msg, await page.eval(async (x) => (await import('/js/i18n.js')).t(x), msg)];
    await page.waitFor((k, w) => w.some((x) => window.__console().slice(k).includes(x)), [n0, want], { what: 'the turn refused' });
  };
  await s.step('rotate', { id: 'BB1' }, () => said('BB1 cannot be turned: it would land on the leads of B1, joining them'), { changes: false });
  // dragged down off the parts beside it (by its channel), then turned: its ICs and wires with it, the nets kept
  await s.step('movePart', { id: 'BB1', dx: 0, dy: 20 }, () => a.movePart('BB1', 0, 20, { grip: [13.4, 5.4] }), {
    expect: (d, b) => { sameNets(d, b); assert.deepEqual([d.parts[0].x, d.parts[0].y], [0, 20]); },
  });
  await s.step('rotate', { id: 'BB1' }, () => a.rotate('BB1', { grip: [13.4, 25.4] }), { expect: (d, b) => { sameNets(d, b); assert.equal(d.parts[0].rot, 1); } });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: circuit: a short circuit and a floating input made on purpose: Check says them; Undo makes it whole', E, async (page) => {
  const s = await breadboard(page, 'short and floating');
  const { a } = s;
  // the top rails' + and − joined by a wire: a short circuit
  await s.step('addWire', { from: 'tp11', to: 'tn11' }, () => a.addWire([[10, -4], [10, -3]]), {
    // (the short, and each IC then powered the wrong way round)
    errors: (e) => /Short circuit: the supply's \+ and − are joined/.test(e[0] || '') && e.slice(1).every((x) => /is powered the wrong way round/.test(x)),
  });
  await s.undo();
  // the wire from the 74194's output to the 7408 (w37) deleted: the 7408's input left floating
  await s.step('deleteWire', { id: 'w37' }, () => a.deleteWire('w37'), { frees: [], expect: (d, b) => assert.equal(d.wires.length, b.wires.length - 1) });
  await s.warnings(['WARNING: U2 pin 1 (1A) is floating: a 74LS input reads high']);
  await s.undoRedo();
});
