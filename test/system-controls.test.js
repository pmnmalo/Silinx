// A System's controls resolved against its emulated boards (#5602, core/system-controls.js, moved from the MCP server):
// an FPGA board's switch or button (its wiring's bit linked to the module), a circuit's switch and its temperature
// sensor, an Explorer 16/32's button and R6; by their times; each control that cannot be refused with the MCP's
// message (the same since the move: test/system-example.test.js runs them through simulate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlSteps } from '../core/system-controls.js';

// an FPGA board: BTN0 and SW3 on its module's btn and sw[3]
const bit = (res, idx, port, w, pos = 0) => ({ res: { name: res }, idx, port, pos, sig: { t: { w } } });
const FPGA = { id: 'fpga', kind: 'fpga', wiring: { bits: [bit('btn', 0, 'btn', 1), bit('sw', 3, 'sw', 8, 3)] }, inputs: [{ pin: 'btn', res: 'btn', idx: 0 }, { pin: 'sw[3]', res: 'sw', idx: 3 }] };
const CIRC = { id: 'bench', kind: 'circuit', model: { parts: [{ id: 'U1', type: 'lm75' }] }, inputs: [{ pin: 'S1', kind: 'button' }, { pin: 'U1', kind: 'temp' }] };
const PIC = { id: 'pic', kind: 'mcu', arch: 'pic24', inputs: [{ pin: 'S3', kind: 'button' }, { pin: 'R6', kind: 'pot', min: 0, max: 1 }] };
const BOARDS = [FPGA, CIRC, PIC];
const END = 10e9;

test('#5602 the controls\' steps by time: an FPGA\'s button and switch, a circuit\'s button and sensor, an Explorer\'s button and R6', () => {
  const s = controlSteps(BOARDS, [
    { node: 'fpga', control: 'sw3', on: true, at_ns: 5e6 }, { node: 'fpga', control: 'btn0', on: true },
    { node: 'bench', control: 'S1', on: 1, at_ns: 2e6 }, { node: 'bench', control: 'U1', value: 30, at_ns: 3e6 },
    { node: 'pic', control: 'S3', on: true, at_ns: 1e6 }, { node: 'pic', control: 'R6', value: 0.25, at_ns: 4e6 }], END);
  assert.deepEqual(s.map(x => [x.t, x.b.id, x.pin, x.on]), [[0, 'fpga', 'btn', true], [1e9, 'pic', 'S3', 1], [2e9, 'bench', 'S1', true], [3e9, 'bench', 'U1', 30], [4e9, 'pic', 'R6', 0.25], [5e9, 'fpga', 'sw[3]', true]]);
  assert.deepEqual(controlSteps(BOARDS, null, END), []);
});

test('#5602 a control that cannot be: refused, its message the MCP\'s', () => {
  const no = (c, message) => assert.throws(() => controlSteps(BOARDS, [c], END), { message });
  no({ node: 'term', control: 'btn0' }, 'controls[0]: no FPGA node \'term\' with a board, a circuit nor an Explorer 16/32, in the System');
  no({ node: 'fpga', control: 'sw1' }, 'controls[0]: no switch or button \'sw1\' of fpga\'s board linked to its module (btn0, sw3)');
  no({ node: 'fpga', control: 'btn0', at_ns: 2e7 }, 'controls[0]: at_ns from 0 to the run\'s time');
  no({ node: 'bench', control: 'S9' }, 'controls[0]: no switch or button \'S9\' in the circuit bench (S1, U1)');
  no({ node: 'bench', control: 'U1', value: 'hot' }, 'controls[0]: U1\'s value: a temperature (°C)');
  no({ node: 'pic', control: 'S9' }, 'controls[0]: no button, potentiometer nor temperature sensor \'S9\' on pic\'s Explorer 16/32 (S3, R6)');
  no({ node: 'pic', control: 'R6', value: 2 }, 'controls[0]: R6\'s value: its travel from 0 to 1');
});
