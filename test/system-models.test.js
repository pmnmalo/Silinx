// A System's FPGA node's models (#5612, core/system-models.js): those its board's toolchain makes (the Basys2's four, the
// iCEBreaker's two), the steps that make each, its file as its build's reports name it (the board's own first), the
// refusals; the Emulation Properties' models in silinx.json, kept with its nodes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_NAMES, nodeModels, modelSteps, nodeModelFile, nodeReportsPath, modelRefusal, emulateModelsOf, withEmulateModels } from '../core/system-models.js';
import { withEmulateNodes, emulateNodesOf } from '../core/system-alone.js';

const FPGA = { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', interfaces: [] };
const ICE = { id: 'ice', kind: 'fpga', module: 'blink', board: 'icebreaker', interfaces: [] };
const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', interfaces: [] };
const SYS = { name: 's', nodes: [UNO, FPGA, ICE], links: [] };

test('#5612 an FPGA node\'s models: its board\'s toolchain\'s, the steps that make each; their names', () => {
  assert.deepEqual(nodeModels(FPGA), ['postsynth', 'posttrans', 'postmap', 'postpar']);
  assert.deepEqual(nodeModels(ICE), ['postsynth', 'postpar']);
  assert.deepEqual(nodeModels({ ...FPGA, board: 'nope' }), []);
  assert.deepEqual(['postsynth', 'posttrans', 'postmap', 'postpar', 'rtl'].map(modelSteps), [['synth', 'postsynth'], ['synth', 'translate', 'posttrans'],
    ['synth', 'translate', 'map', 'postmap'], ['synth', 'translate', 'map', 'par', 'postpar'], []]);
  assert.deepEqual(Object.values(MODEL_NAMES), ['Behavioral (RTL)', 'Post-Synthesis', 'Post-Translate', 'Post-Map', 'Post-Place & Route']);
});

test('#5612 a model\'s file, as its node\'s build\'s reports name it: the board\'s own first; none when not made', () => {
  const rep = { simModels: { postsynth: { path: 'build/netgen/synthesis/uart_synthesis.vhd' }, postpar: { path: 'build/netgen/par/uart_timesim.vhd', board: { path: 'build/netgen/par/uart_timesim_board.vhd' } } } };
  assert.equal(nodeReportsPath('fpga'), 'build/nodes/fpga/build/reports.json');
  assert.equal(nodeModelFile(rep, 'fpga', 'postsynth'), 'build/nodes/fpga/build/netgen/synthesis/uart_synthesis.vhd');
  assert.equal(nodeModelFile(rep, 'fpga', 'postpar'), 'build/nodes/fpga/build/netgen/par/uart_timesim_board.vhd');
  assert.equal(nodeModelFile(rep, 'fpga', 'postmap'), null);
  assert.equal(nodeModelFile(null, 'fpga', 'postsynth'), null);
});

test('#5612 the Emulation Properties\' models: an FPGA node\'s, one its toolchain makes; kept with the nodes; refusals', () => {
  const pj = { name: 'p' };
  assert.deepEqual([modelRefusal(FPGA, 'rtl'), modelRefusal(FPGA, 'postmap'), modelRefusal(ICE, 'postmap'), modelRefusal(UNO, 'postsynth')],
    [null, null, 'ice: no model \'postmap\' (its board\'s toolchain makes rtl, postsynth, postpar)', 'uno: only an FPGA node has models']);
  const a = withEmulateModels(pj, SYS, { fpga: 'postsynth', ice: 'postpar' });
  assert.deepEqual(a, { name: 'p', system: { emulate: { models: { fpga: 'postsynth', ice: 'postpar' } } } });
  assert.deepEqual(emulateModelsOf(a, SYS), { fpga: 'postsynth', ice: 'postpar' });
  // (its nodes ticked: its models kept; every node again: the models still)
  const b = withEmulateNodes(a, SYS, ['fpga']);
  assert.deepEqual([emulateNodesOf(b, SYS), emulateModelsOf(b, SYS)], [['fpga'], { fpga: 'postsynth', ice: 'postpar' }]);
  assert.deepEqual(withEmulateNodes(b, SYS, null).system, { emulate: { models: { fpga: 'postsynth', ice: 'postpar' } } });
  // (the RTL: left out; none left: the setting left out)
  assert.deepEqual(withEmulateModels(a, SYS, { fpga: 'rtl', ice: null }), { name: 'p' });
  assert.deepEqual(withEmulateModels(pj, SYS, { ice: 'postmap' }), { error: 'ice: no model \'postmap\' (its board\'s toolchain makes rtl, postsynth, postpar)' });
  assert.deepEqual(withEmulateModels(pj, SYS, { x: 'postsynth' }), { error: 'x: no such node in s' });
  // (a model its toolchain no longer makes, a node removed: not used)
  assert.deepEqual(emulateModelsOf({ system: { emulate: { models: { ice: 'postmap', gone: 'postsynth', fpga: 'postsynth' } } } }, SYS), { fpga: 'postsynth' });
});
