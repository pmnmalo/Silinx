// The examples on the GateMate's board (#2431): each example's CCF made from the pins of Cologne Chip's evaluation board (its
// LEDs, switches and buttons on its headers, its display on its Pmods; vga on the gatemate-evb-vga), built by the Silinx
// toolchain to its .bit through nextpnr-himbaechel-gatemate and gmpack, the board's 10 MHz met. The bitstream read
// back by gmunpack: nextpnr's configuration, setting by setting (scripts/gatemate-measure.mjs compareConfigs), but a flip-flop's
// initial value (FF_INIT), which gmunpack may not read back (the measurement's). Their warnings: those of WARNINGS, nothing else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, GATEMATE_TARGETS, exampleBoard, targetName, exampleProject, exampleUcf, silinxFlow } from './examples-lib.mjs';
import { compareConfigs } from '../scripts/gatemate-measure.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-examples-gatemate-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// the warnings of each example (seed 1): micro80's Yosys's of its RAM's port, widened to the block RAM's (Yosys 0.71's netlists:
// nextpnr places and routes every example with seed 1, uart's two crashes of Yosys 0.70's netlist gone, #5634)
const WARNINGS = {
  micro80: ['WARNING:Yosys - Resizing cell port micro80_top.memory.0.0.B_DO from 10 bits to 20 bits.'],
};
// the bitstreams gmunpack cannot read back: Project Peppercorn's gmunpack (YoWASP's 0.11.825) traps on stopwatch's, which its
// own gmpack wrote from nextpnr's configuration (a WebAssembly trap, "memory access out of bounds"; Yosys 0.71's netlist, #5699):
// the trap asserted, so that the read-back comes back when gmunpack reads it
const UNREADABLE = new Set(['stopwatch']);

test('the examples\' ports on the GateMate evaluation board: every one with a pin', () => {
  for (const name of EXAMPLES) assert.deepEqual(exampleUcf(name, exampleBoard(name, GATEMATE_TARGETS[0])).unmatched, [], name);
  assert.deepEqual(exampleBoard('vga', GATEMATE_TARGETS[0]), { board: 'gatemate-evb-vga' });
});

describe('the examples on the GateMate\'s board', { concurrency: 2 }, () => {
  for (const name of EXAMPLES) {
    for (const t of GATEMATE_TARGETS.map(x => exampleBoard(name, x))) {
      test(`example ${name} on the ${targetName(t)}: a CCF from the board, the Silinx toolchain builds the .bit, its warnings`, { timeout: 600000 }, async () => {
        const { dir, project } = exampleProject(name, t, tmp);
        assert.match(project.constraints, /\.ccf$/);
        const job = await silinxFlow(dir, project, ['synth', 'translate', 'par', 'trce', 'bitgen']);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        assert.match(log, /Device: ccgm1a1-fbga324: nextpnr-himbaechel-gatemate and gmpack\./);
        assert.match(log, /Placed and routed by nextpnr-himbaechel-gatemate in /);
        const m = new RegExp(`Bitstream: build/${project.top}\\.bit \\((\\d+) bytes, gmpack in `).exec(log);
        assert.ok(m, log.slice(-2000));
        const bit = fs.readFileSync(path.join(dir, 'build', `${project.top}.bit`));
        assert.equal(bit.length, +m[1]);
        // a clocked example: the board's 10 MHz met
        const clocked = /^# create_clock -period 100\.000 \[get_ports \{clk\}\]$/m.test(fs.readFileSync(path.join(dir, project.constraints), 'utf8'));
        assert.equal(clocked, name !== 'gates');
        if (clocked) assert.match(log, /Clock clk: [\d.]+ MHz \(met, 10 MHz asked\)/);
        assert.deepEqual(job.lines.filter(l => /warning/i.test(l)), WARNINGS[name] || []);
        // the bitstream read back: nextpnr's configuration
        const { runGmunpack } = await import('@yowasp/nextpnr-himbaechel-gatemate');
        const unpack = () => runGmunpack(['design.bit', 'unpacked.cfg'], { 'design.bit': bit }, { stdout: () => {}, stderr: () => {}, fetchProgress: () => {} });
        if (UNREADABLE.has(name)) { await assert.rejects(unpack(), /memory access out of bounds/, name); return; }
        const out = await unpack();
        const read = out['unpacked.cfg'];
        const back = compareConfigs(fs.readFileSync(path.join(dir, 'build', 'open', 'routed.cfg'), 'utf8'), typeof read === 'string' ? read : new TextDecoder().decode(read));
        assert.ok(back.settings > 0);
        assert.deepEqual([back.lost.filter(s => !/FF_INIT/.test(s)), back.added], [[], []], name);
      });
    }
  }
});
