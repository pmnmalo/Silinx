// Usability (#5148, part 4): the ASM chart editor (web/js/asm-*.js) as a person uses it, on the lock example's timer
// (examples/lock, src/timer.asm.json): a state box added with its tool and named, a decision and a conditional output
// added on the free exits of the boxes before them, their texts typed, their exits linked by dragging a port to a box
// (one already drawn moved); boxes dragged and nudged with the arrow keys; boxes' texts typed in Properties, an
// unfinished condition said as an error and finished; a box and an arrow deleted, the chart's errors said and mended.
// After every step the chart's Validate (no error but the ones a step makes on purpose), the HDL it makes in VHDL and
// Verilog compiled and elaborated; Validate's warnings exactly; Undo back to the start and Redo to the end. In both
// interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt). The bugs found are todo tests: two
// edits of the same kind soon after each other merged into one Undo step, a double click on a box adding a state.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { asmActions } from './lib/asm-actions.js';

const FILE = 'test/usability/asm.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
let n = 0;
const KIT = drawKit('asm', asmActions);

async function timer(page, title) {
  const name = `UsabAsm${++n}`;
  await makeProject(env, { name, template: 'lock' });
  await page.openProject(name);
  const s = new Session(page, env, { file: FILE, title, kit: KIT });
  await s.open('src/timer.asm.json');
  return s;
}
const box = (d, id) => d.nodes.find((x) => x.id === id);
const exits = (d, id) => d.edges.filter((e) => e.from === id).map((e) => `${e.port}>${e.to}`).sort();
const added = (d, b) => d.nodes.filter((x) => !b.nodes.some((y) => y.id === x.id));

// (a pause between two edits of the same kind, as a person's: two within 1.5 s are one Undo step, the todo test below)
const pause = () => new Promise((r) => setTimeout(r, 1600));
const noExit = (what) => `error: ${what} has no exit${/^State/.test(what) ? ' (next state path)' : ''}`;

uiTest('usability: ASM: a state, a decision and a conditional output added and linked, their texts typed; Validate; Undo, Redo', E, async (page) => {
  const s = await timer(page, 'add boxes');
  const { a } = s;
  // a state box to the right of the chart, where nothing is (an error until it has an exit)
  await s.step('addAt', { tool: 'State', at: '(620, 300)' }, () => a.addAt('State', 620, 300), {
    errors: [noExit("State 'S0'")],
    expect: (d, b) => assert.deepEqual(added(d, b).map((x) => `${x.type} ${x.name} ${x.x},${x.y}`), ['state S0 620,300']),
  });
  const p = added(s.doc, s.docs[0])[0].id;
  await s.step('setField', { box: p, Name: 'PAUSE' }, () => a.setField(p, 'Name', 'PAUSE'), { errors: [noExit("State 'PAUSE'")], expect: (d) => assert.equal(box(d, p).name, 'PAUSE') });
  await s.warnings([`ERROR: ${noExit("State 'PAUSE'").slice(7)}`, "WARNING: State 'PAUSE' is unreachable from the initial state"]);
  // a decision on its free exit (the first input its condition), typed: tick
  await s.step('addOn', { tool: 'Decision', on: 'PAUSE' }, () => a.addOn('Decision', p), {
    errors: ["error: Decision 'start' has no exits (needs a 1 and a 0 branch)"],
    expect: (d, b) => { assert.deepEqual(added(d, b).map((x) => `${x.type} ${x.cond}`), ['decision start']); assert.deepEqual(exits(d, p), [`next>${added(d, b)[0].id}`]); },
  });
  const q = added(s.doc, s.docs.at(-2))[0].id;
  await s.step('setField', { box: q, Condition: 'tick' }, () => a.setField(q, 'Condition', 'tick'), {
    errors: ["error: Decision 'tick' has no exits (needs a 1 and a 0 branch)"], expect: (d) => assert.equal(box(d, q).cond, 'tick'),
  });
  // a conditional output on its 1 exit, its outputs typed; then its exit to COUNT, and the 0 exit back to PAUSE
  await s.step('addOn', { tool: 'Cond. output', on: q }, () => a.addOn('Cond. output', q), {
    errors: ["error: Decision 'tick' has no 0 (false) branch", noExit("Conditional output box 'done = 1'")],
    expect: (d, b) => { assert.deepEqual(added(d, b).map((x) => `${x.type} ${x.actions}`), ['output done = 1']); assert.deepEqual(exits(d, q), [`true>${added(d, b)[0].id}`]); },
  });
  const o = added(s.doc, s.docs.at(-2))[0].id;
  await s.step('setField', { box: o, outputs: 'cnt = 0' }, () => a.setField(o, 'Mealy outputs (one per line)', 'cnt = 0'), {
    errors: ["error: Decision 'tick' has no 0 (false) branch", noExit("Conditional output box 'cnt = 0'")], expect: (d) => assert.deepEqual(box(d, o).actions, ['cnt = 0']),
  });
  await s.step('connect', { from: o, port: 'next', to: 'COUNT' }, () => a.connect(o, 'next', 's2'), {
    errors: ["error: Decision 'tick' has no 0 (false) branch"], expect: (d) => assert.deepEqual(exits(d, o), ['next>s2']),
  });
  await pause();
  await s.step('connect', { from: q, port: 'false', to: 'PAUSE' }, () => a.connect(q, 'false', p), { expect: (d) => assert.deepEqual(exits(d, q), [`false>${p}`, `true>${o}`]) });
  await s.warnings(["WARNING: State 'PAUSE' is unreachable from the initial state"]);
  // COUNT's wait for the tick (d2's 0 exit, to COUNT) moved to PAUSE: reached
  await pause();
  await s.step('connect', { from: 'd2', port: 'false', to: 'PAUSE' }, () => a.connect('d2', 'false', p), { expect: (d) => assert.deepEqual(exits(d, 'd2'), [`false>${p}`, 'true>d3']) });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: ASM: two boxes added one soon after the other: each its own Undo step', E, async (page, _env, t) => {
  t.todo('#5167: two boxes added within 1.5 s are merged into one Undo step (commit(\'add\'), asm-editor.js)');
  const s = await timer(page, 'quick adds');
  const { a } = s;
  await s.step('addAt', { tool: 'State', at: '(620, 200)' }, () => a.addAt('State', 620, 200), { errors: [noExit("State 'S0'")] });
  await s.step('addAt', { tool: 'State', at: '(620, 400)' }, () => a.addAt('State', 620, 400), { errors: [noExit("State 'S0'"), noExit("State 'S1'")] });
  await s.undoRedo();
});

uiTest('usability: ASM: boxes dragged and nudged with the arrow keys: their arrows kept; Undo, Redo', E, async (page) => {
  const s = await timer(page, 'move boxes');
  const { a } = s;
  const sameEdges = (d, b) => assert.deepEqual(d.edges, b.edges);
  // (o3, off the grid at 430, 630, snapped to it as it is dragged)
  await s.step('moveBox', { box: 'o3', dx: 70, dy: 30 }, () => a.moveBox('o3', 70, 30), {
    expect: (d, b) => { sameEdges(d, b); assert.deepEqual([box(d, 'o3').x, box(d, 'o3').y], [500, 660]); },
  });
  await s.step('nudge', { box: 'o2', key: 'ArrowLeft', times: 2 }, () => a.nudge('o2', 'ArrowLeft', 2), {
    expect: (d, b) => { sameEdges(d, b); assert.deepEqual([box(d, 'o2').x, box(d, 'o2').y], [160, 740]); },
  });
  await s.step('moveBox', { box: 'IDLE', dx: -100 }, () => a.moveBox('s1', -100, 0), {
    expect: (d, b) => { sameEdges(d, b); assert.deepEqual([box(d, 's1').x, box(d, 's1').y], [100, 80]); },
  });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: ASM: boxes\' texts typed in Properties; an unfinished condition said, finished; Undo, Redo', E, async (page) => {
  const s = await timer(page, 'edit texts');
  const { a } = s;
  await s.step('setField', { box: 'COUNT', Name: 'COUNTING' }, () => a.setField('s2', 'Name', 'COUNTING'), { expect: (d) => assert.equal(box(d, 's2').name, 'COUNTING') });
  await s.step('setField', { box: 'd3', Condition: 'cnt >=' }, () => a.setField('d3', 'Condition', 'cnt >='), {
    errors: (e) => e.length === 1 && e[0].startsWith("error: Decision 'cnt >=': "),
    expect: (d) => assert.equal(box(d, 'd3').cond, 'cnt >='),
  });
  // (a moment to read the error)
  await pause();
  await s.step('setField', { box: 'd3', Condition: 'cnt >= secs - 1' }, () => a.setField('d3', 'Condition', 'cnt >= secs - 1'), { expect: (d) => assert.equal(box(d, 'd3').cond, 'cnt >= secs - 1') });
  // COUNT's Moore outputs: two lines; o3's
  await s.step('setField', { box: 'COUNT', outputs: 'left = secs - cnt\ndone = 0' }, () => a.setField('s2', 'Moore outputs (one per line)', 'left = secs - cnt\ndone = 0'), {
    expect: (d) => assert.deepEqual(box(d, 's2').actions, ['left = secs - cnt', 'done = 0']),
  });
  await s.step('setField', { box: 'o3', outputs: 'cnt = cnt + 2' }, () => a.setField('o3', 'Mealy outputs (one per line)', 'cnt = cnt + 2'), {
    expect: (d) => assert.deepEqual(box(d, 'o3').actions, ['cnt = cnt + 2']),
  });
  await s.warnings([]);
  await s.undoRedo();
});

uiTest('usability: ASM: a box double-clicked: the field of its text focused, typed over (no new box)', E, async (page, _env, t) => {
  t.todo('#5168: a double click on a box adds a new state there (the svg captures the pointer: the dblclick\'s target is not the box, asm-pointer.js onDblClick)');
  const s = await timer(page, 'double click');
  await s.step('typeOver', { box: 'd3', cond: 'cnt >= secs - 1' }, () => s.a.typeOver('d3', 'cnt >= secs - 1'), {
    expect: (d, b) => { assert.equal(d.nodes.length, b.nodes.length); assert.equal(box(d, 'd3').cond, 'cnt >= secs - 1'); },
  });
  await s.undoRedo();
});

uiTest('usability: ASM: a conditional output deleted, then an arrow: Validate says what is missing; mended; Undo, Redo', E, async (page) => {
  const s = await timer(page, 'delete');
  const { a } = s;
  // o2 (done = 1): d3's 1 exit then goes nowhere
  await s.step('deleteBox', { box: 'o2' }, () => a.deleteBox('o2'), {
    errors: ["error: Decision 'cnt == secs - 1' has no 1 (true) branch"],
    expect: (d) => { assert.equal(box(d, 'o2'), undefined); assert.deepEqual(exits(d, 'd3'), ['false>o3']); },
  });
  await s.warnings(["ERROR: Decision 'cnt == secs - 1' has no 1 (true) branch"]);
  // d3's 1 exit drawn to IDLE: whole again
  await s.step('connect', { from: 'd3', port: 'true', to: 'IDLE' }, () => a.connect('d3', 'true', 's1'), { expect: (d) => assert.deepEqual(exits(d, 'd3'), ['false>o3', 'true>s1']) });
  // d2's 0 exit (COUNT waits for the tick) deleted, then drawn again
  await s.step('deleteArrow', { arrow: 'e7' }, () => a.deleteArrow('e7'), {
    errors: ["error: Decision 'tick' has no 0 (false) branch"], expect: (d) => assert.deepEqual(exits(d, 'd2'), ['true>d3']),
  });
  await s.step('connect', { from: 'd2', port: 'false', to: 'COUNT' }, () => a.connect('d2', 'false', 's2'), { expect: (d) => assert.deepEqual(exits(d, 'd2'), ['false>s2', 'true>d3']) });
  // (done, no longer set anywhere, keeps its default: nothing said)
  await s.warnings([]);
  await s.undoRedo();
});
