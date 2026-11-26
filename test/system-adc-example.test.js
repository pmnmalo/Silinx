// The adc-pmod System example (#5384): a Basys 2 (examples/adc-pmod/fpga/adc_display.vhd) reading a Pmod AD1 on its JA
// header over SPI, a potentiometer on the AD1's A0 (the circuit node, examples/adc-pmod/bench/bench.circ.json), the
// code shown in hexadecimal on the four displays and its top bits on the LEDs. Its System checked with no warning; run
// from its own files, the AD7476A's code ⌊VIN × 4096 / VCC⌋ read on the displays (each multiplexed digit decoded from
// its segments), at the potentiometer's middle and turned; its wires' latency the SPI part's, said in the console.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSystem } from '../core/system-doc.js';
import { withNodePins } from '../core/system-constraints.js';
import { analyzeSystem } from '../core/system-check.js';
import { normalizeCircuit } from '../core/circuit.js';
import { systemInputs, systemFromInputs, systemReport } from '../core/system-run.js';
import { netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { designOf } from './compiled-diff.js';
import { ROOT } from './examples-lib.mjs';

const DIR = path.join(ROOT, 'examples/adc-pmod');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const UCF = 'fpga/adc_display.ucf', CIRC = 'bench/bench.circ.json';
const { system: SYS, problems } = withNodePins(normalizeSystem(JSON.parse(read('adc_pmod.sys.json'))), { [UCF]: read(UCF) });
const PORTS = { adc_display: [['clk', 'in', 1], ['cs', 'out', 1], ['sck', 'out', 1], ['d0', 'in', 1], ['led', 'out', 8], ['seg', 'out', 7], ['dp', 'out', 1], ['an', 'out', 4]].map(([name, dir, width]) => ({ name, dir, width })) };
const netlist = await netlistOf(designOf([{ path: 'fpga/adc_display.vhd', lang: 'vhdl', role: 'design', text: read('fpga/adc_display.vhd') }], 'adc_display'), { run: yosysNode });
// the displays' segments (seg(0) a … seg(6) g, lit at 0) of each hexadecimal digit, seg(6) first
const SEGS = ['1000000', '1111001', '0100100', '0110000', '0011001', '0010010', '0000010', '1111000', '0000000', '0010000', '0001000', '0000011', '1000110', '0100001', '0000110', '0001110'];

// the example's circuit, its potentiometer at pos %; the System run for `ms`, the displays read: each anode's digit
async function run(pos, ms = 1.4) {
  const c = JSON.parse(read(CIRC));
  c.parts.find((p) => p.id === 'RV1').pos = pos;
  const inputs = await systemInputs(SYS, { ports: PORTS, netlist: () => netlist, circuit: async () => JSON.stringify(c) });
  assert.equal(inputs.error, undefined);
  const r = systemFromInputs(SYS, inputs);
  assert.equal(r.error, undefined);
  const f = r.sim.nodes.get('fpga'), digits = {};
  // (a sample every 100 µs: each display lit for 327 µs of every 1.31 ms)
  for (let t = 100; t <= ms * 1000; t += 100) {
    r.sim.run(t * 1e6);
    const an = [3, 2, 1, 0].map((k) => f.value(`an[${k}]`)).join(''), seg = [6, 5, 4, 3, 2, 1, 0].map((k) => f.value(`seg[${k}]`)).join('');
    const which = ['0111', '1011', '1101', '1110'].indexOf(an);
    if (which >= 0) digits[3 - which] = SEGS.indexOf(seg);
  }
  return { rep: systemReport(r), shown: [3, 2, 1, 0].map((k) => digits[k]), leds: parseInt([7, 6, 5, 4, 3, 2, 1, 0].map((k) => f.value(`led[${k}]`)).join(''), 2) };
}

test('#5384 the adc-pmod example: its System and its circuit checked, no warning; its pins from its constraints file', () => {
  assert.deepEqual(problems, []);
  assert.deepEqual([SYS.nodes[0].pins.cs, SYS.nodes[0].pins.d0, SYS.nodes[0].pins.sck], ['B2', 'A3', 'B5']);
  const { diags } = analyzeSystem(SYS, { modules: PORTS, files: [CIRC, UCF], circuits: { [CIRC]: normalizeCircuit(JSON.parse(read(CIRC))) }, constraints: { [UCF]: read(UCF) } });
  assert.deepEqual(diags.map((d) => `${d.severity}: ${d.message}`), []);
});

test('#5384 the adc-pmod example run: the potentiometer\'s code on the displays (0 then three hexadecimal digits) and its top bits on the LEDs; turned, they follow', async () => {
  // (the wiper at pos % from its end 1 (3V3): VIN = 3.3 × (1 − pos / 100), the code ⌊VIN × 4096 / 3.3⌋ less the AD1's few mV of load)
  for (const [pos, want] of [[50, 2048], [80, 819]]) {
    const { rep, shown, leds } = await run(pos);
    assert.deepEqual([rep.errors, rep.warnings], [[], []]);
    assert.equal(shown[0], 0, `the left display: ${shown}`);
    const code = shown[1] * 256 + shown[2] * 16 + shown[3];
    assert.ok(Math.abs(code - want) <= 4, `${pos} %: ${code.toString(16)} shown, about ${want.toString(16)}`);
    assert.equal(leds, code >> 4);
    assert.equal(rep.lines[1], 'circuit bench: its wires answer in 20 ns, a sixteenth of an SPI clock of 3.125 MHz, for its SPI part AD1: a faster one, its SPI clock in its Properties');
  }
});
