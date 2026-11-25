// A System's stimulus file (#5581's part 3, core/system-stimulus.js): read (its format, its version, its lists), its steps
// by time (a board's control, the text typed into a terminal; each that cannot be refused, said), and set in a run as it
// goes: the uart example's FPGA and a terminal, a line typed at 2 ms echoed, BTN0 pressed at 1 ms sending the FPGA's
// message; the same run with no stimulus as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readStimulus, newStimulus, isStimulusFile, setsControls, stimulusSteps, runSteps, STIMULUS_FORMAT } from '../core/system-stimulus.js';
import { emulationBoards, withBoards, watchBoards } from '../core/system-emu.js';
import { systemPlan } from '../core/system-build.js';
import { systemFromInputs, systemReport } from '../core/system-run.js';
import { normalizeSystem } from '../core/system-doc.js';
import { uartNetlist } from './system-sim-lib.mjs';
import { ROOT } from './examples-lib.mjs';

const UCF = fs.readFileSync(path.join(ROOT, 'examples/uart/constraints/top.ucf'), 'utf8');
const PINS = Object.fromEntries([...UCF.matchAll(/^NET "([^"]+)"\s+LOC = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const sys = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }], nodes: [
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: PINS, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }] },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] }] });
const PORTS = { uart: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rx', dir: 'in', width: 1 }, { name: 'btn', dir: 'in', width: 1 }, { name: 'tx', dir: 'out', width: 1 }] };
// the System ready to run, its boards emulated
async function ready() {
  const inputs = { plan: systemPlan(sys, { ports: PORTS }), netlists: { fpga: await uartNetlist() }, firmware: {} };
  const boards = emulationBoards(sys, inputs);
  const run = systemFromInputs(sys, withBoards(inputs, boards));
  assert.equal(run.error, undefined, run.error);
  watchBoards(run.sim, boards);
  return { run, boards };
}

test('#5581 a stimulus file read: its format, its version, its lists; a new one\'s text', () => {
  assert.deepEqual(readStimulus(newStimulus()), { stimulus: { controls: [], type: [] } });
  assert.equal(JSON.parse(newStimulus()).format, STIMULUS_FORMAT);
  assert.deepEqual(readStimulus('{"format":"silinx-stimulus","version":1}'), { stimulus: { controls: [], type: [] } });
  assert.match(readStimulus('{').error, /^not JSON: /);
  assert.deepEqual(readStimulus('{"format":"silinx-system","version":1}'), { error: 'not a stimulus file (its format is not \'silinx-stimulus\')' });
  assert.deepEqual(readStimulus('{"format":"silinx-stimulus","version":2}'), { error: 'a stimulus file of version 2: this Silinx reads version 1' });
  assert.deepEqual(readStimulus('{"format":"silinx-stimulus","version":1,"type":{}}'), { error: 'type: a list' });
  assert.deepEqual([isStimulusFile('sim/a.stim.json'), isStimulusFile('a.json'), setsControls({ controls: [{}] }), setsControls({ controls: [] }), setsControls(null)], [true, false, true, false, false]);
});

test('#5581 its steps by time: a control, text typed; each that cannot be refused', async () => {
  const { boards } = await ready();
  const steps = stimulusSteps({ controls: [{ node: 'fpga', control: 'btn0', on: true, at_ns: 3e6 }], type: [{ terminal: 'term', text: 'A\n', at_ns: 1e6 }, { terminal: 'term', text: 'B' }] }, { boards, terminals: ['term'] });
  assert.deepEqual(steps.map(s => [s.t, s.set ? `${s.set.b.id}.${s.set.pin}=${s.set.on}` : `${s.type.node}:${s.type.bytes}`]), [[0, 'term:66'], [1e9, 'term:65,10'], [3e9, 'fpga.btn=true']]);
  const no = (s, message, o = {}) => assert.throws(() => stimulusSteps(s, { boards, terminals: ['term'], ...o }), { message });
  no({ type: [{ terminal: 'nope', text: 'x' }] }, 'type[0]: no terminal \'nope\' in the System (term)');
  no({ type: [{ terminal: 'term', text: 5 }] }, 'type[0]: its text, a string');
  no({ type: [{ terminal: 'term', text: 'x', at_ns: 2e9 }] }, 'type[0]: at_ns from 0 to the run\'s time', { end: 1e9 });
  no({ controls: [{ node: 'fpga', control: 'sw7', on: true }] }, 'controls[0]: no switch or button \'sw7\' of fpga\'s board linked to its module (btn0)');
  assert.throws(() => stimulusSteps({ controls: [{ node: 'fpga', control: 'btn0' }] }, { boards: [], terminals: [] }), { message: 'controls[0]: no FPGA node \'fpga\' with a board, a circuit nor an Explorer 16/32, in the System' });
});

test('#5581 a stimulus set in the run as it goes: a line typed at 2 ms echoed; BTN0 pressed at 1 ms, its message sent; none, nothing', async () => {
  const typed = await ready();
  runSteps(typed.run, stimulusSteps({ type: [{ terminal: 'term', text: 'A\n', at_ns: 2e6 }] }, { boards: typed.boards, terminals: ['term'] }), 20e9);
  assert.deepEqual([systemReport(typed.run).terminals.term, typed.run.sim.now], ['A\n', 20e9]);
  const pressed = await ready();
  const steps = stimulusSteps({ controls: [{ node: 'fpga', control: 'btn0', on: true, at_ns: 1e6 }, { node: 'fpga', control: 'btn0', on: false, at_ns: 30e6 }] }, { boards: pressed.boards, terminals: ['term'] });
  runSteps(pressed.run, steps, 60e9);
  assert.deepEqual([steps.length, systemReport(pressed.run).terminals.term], [0, 'Hello from Silinx!\r\n']);
  const none = await ready();
  runSteps(none.run, [], 20e9);
  assert.deepEqual(systemReport(none.run).terminals, { term: '' });
});
