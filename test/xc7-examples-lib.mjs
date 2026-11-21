// The 7-series' examples on a board through the Silinx toolchain's back end, as the local server runs it (#3146, #3147): every
// example (gates … micro80) from HDL to its .bit with the XDC the board's pin assignment writes, its warnings the expected
// ones (none, or the target's, #4681), the board's clock met by nextpnr's estimate (or the warnings say it is not), its LUTs,
// registers and frequency held to a table, the .bit read back as its part's and checked against nextpnr's FASM with no
// Vivado (#3145: its frames fasm2frames', the round trip by bits clean, its pins the XDC's). Shared by
// test/open-flow-xc7-server.test.js (the Artix-7's boards) and test/open-flow-zynq-server.test.js (the Zybo Z7's, #4681),
// files of their own for their time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { runOpenImplementation } from '../server/open-flow.js';
import { parseBitHeader } from '../server/programmer.js';
import { loadBitDbXc7 } from '../packages/silinx-fpga/src/node.js';
import { readBitXc7 } from '../packages/silinx-fpga/src/fpga/xc7/bitstream.js';
import { bitIndexXc7, readBitFramesXc7 } from '../packages/silinx-fpga/src/fpga/xc7/readback.js';
import { referenceFrames, roundTrip } from '../packages/silinx-fpga/src/fpga/xc7/roundtrip.js';
import { xdcPins, ioConfig, checkPins } from '../packages/silinx-fpga/src/fpga/xc7/pins.js';
import { readXdc } from '../packages/silinx-fpga/src/xdc.js';
import { XC7_DB_DIR } from '../packages/silinx-fpga/src/fpga/xc7/bitdb-node.js';
import { EXAMPLES, exampleProject, targetName } from './examples-lib.mjs';

/** A project's run of the Silinx toolchain on the local server: { lines, result } or { lines, error }. */
export async function run(dir, project, steps = ['synth', 'translate', 'par', 'trce', 'bitgen']) {
  const lines = [];
  const job = { log: l => lines.push(l), result: null, cancelled: false, procs: new Set() };
  try {
    return { lines, result: await runOpenImplementation(job, { project, projectDir: dir, steps }) };
  } catch (e) { return { lines, error: e }; }
}
// each example's pins (its ports with a pin in the XDC, a bit each), the same on every board
export const PINS = { gates: 6, breadboard: 11, traffic: 24, blinky: 27, pong: 27, stopwatch: 26, clock: 27, vga: 16, isqrt: 23, uart: 24, micro80: 29, lock: 28 };
export const warnings = lines => lines.join('\n').split('\n').filter(l => /WARNING|ERROR/.test(l));

/** The tests of every example on each target: parts (each target's part, by its name: part, slices, regs, iobs, bitPart,
 *  idcode, frames, mhz, required), quality (its examples' [LUTs, registers, MHz]), expected (its examples' warnings, patterns). */
export function xc7ExampleTests(targets, { parts, quality, expected = {} }) {
  for (const target of targets) test(`every example on the ${targetName(target)} through the 7-series' back end: its warnings the expected ones, its .bit, the board's clock met by nextpnr's estimate, its LUTs, registers and frequency the table's`, async t => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-'));
    const board = targetName(target), P = parts[board];
    const db = loadBitDbXc7(P.part);
    const index = bitIndexXc7(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(XC7_DB_DIR, `${P.part}.json.gz`))).toString('utf8')));
    try {
      for (const name of EXAMPLES) {
        await t.test(name, async t => {
          const { dir, project } = exampleProject(name, target, tmp);
          const { lines, result, error } = await run(dir, project);
          assert.equal(error, undefined, error?.message);
          // (the warnings: none, or the target's expected ones, each a pattern, #4681)
          const want = expected[board]?.[name] ?? [], got = warnings(lines);
          assert.equal(got.length, want.length, `${name}: ${JSON.stringify(got)}`);
          got.forEach((l, i) => assert.match(l, want[i], name));
          assert.deepEqual(result.completedSteps, ['synth', 'translate', 'par', 'trce', 'bitgen']);
          const r = result.reports;
          assert.equal(r.source, 'open');
          assert.equal(r.par.engine, 'nextpnr');
          assert.equal(r.par.router, 'router2');
          // the resources: the synthesis's, then nextpnr's held to the part's (the xc7a35t's slices' 41,600 registers, its
          // 106 pins; the xc7a100t's 126,800 and 210)
          assert.ok(r.synthesis.utilization.find(u => u.name === 'Number of Slice LUTs').used > 0, name);
          const row = n => r.map.utilization.find(u => u.name === n), regs = row('Number of Slice Registers'), iob = row('Number of bonded IOBs');
          if (name !== 'gates') assert.ok(row('Number of Slice LUTs').used > 0 && row('Number of occupied Slices').total === P.slices, name);
          assert.equal(iob.total, P.iobs);
          if (name !== 'gates') assert.equal(regs.total, P.regs);
          // the timing: nextpnr's estimate; gates has no clock
          assert.match(r.timing.model, /^nextpnr's estimate/);
          if (name === 'gates') assert.deepEqual([r.timing.met, r.timing.constraints], [null, []]);
          else {
            // (met, its frequency the board's clock at least; an example whose warnings say it is not: below it)
            const met = !want.some(re => /the clock clk reaches/.test(re.source));
            assert.equal(r.timing.met, met, name);
            assert.deepEqual(r.timing.constraints.map(c => c.name), ['clk']);
            assert.ok(met === (r.timing.maxFreqMHz >= P.mhz), `${name}: ${r.timing.maxFreqMHz} MHz`);
          }
          // the quality (#3147): the LUTs, the registers and the frequency reported, held to the table's (a regression of
          // the packer's, #3160's feed-throughs, or of the router's fails)
          const q = { luts: row('Number of Slice LUTs').used, regs: regs?.used ?? 0, mhz: r.timing.maxFreqMHz ?? null };
          t.diagnostic(`${board} ${name}: ${q.luts} LUTs (${row('LUTs as feed-throughs (nextpnr)')?.used ?? 0} feed-throughs), ${q.regs} registers, ${row('Number of occupied Slices').used} slices${q.mhz ? `, ${q.mhz} MHz` : ''}`);
          const [luts, nregs, mhz] = quality[board][name];
          assert.ok(q.luts <= Math.ceil(luts * 1.15), `${name}: ${q.luts} LUTs, the table's ${luts}`);
          assert.ok(Math.abs(q.regs - nregs) <= Math.ceil(nregs * 0.1), `${name}: ${q.regs} registers, the table's ${nregs}`);
          if (mhz) assert.ok(q.mhz >= mhz * 0.85, `${name}: ${q.mhz} MHz, the table's ${mhz}`);
          assert.ok(fs.readFileSync(path.join(dir, 'build/open/timing.txt'), 'utf8').startsWith(`Timing of ${P.part} after Place & Route: nextpnr's estimate`));
          // the .bit: the part's, its frames read back
          const bit = fs.readFileSync(path.join(dir, `build/${project.top}.bit`));
          assert.equal(r.bit.size, bit.length);
          const h = parseBitHeader(bit);
          assert.deepEqual([h.designName, h.rawDesign, h.part], [project.top, `${project.top};Generator=silinx-fpga`, P.bitPart]);
          assert.ok([...readBitXc7(new Uint8Array(bit), db).values()].filter(w => w.some(Boolean)).length > 0, name);
          // checked against nextpnr's FASM (#3145): its frames fasm2frames' (the part's others zeros), the round trip by bits
          // clean, nothing added (no STEPDOWN in a bank of LVCMOS33, no PUDC_B pull-up asked; the part's required features, the
          // Zynq-7000's three)
          const fasm = fs.readFileSync(path.join(dir, 'build/open/routed.fasm'), 'utf8');
          const ref = referenceFrames(index, fasm), back = readBitFramesXc7(new Uint8Array(bit), index);
          assert.equal(back.idcode, P.idcode);
          let differ = 0;
          for (const [a, w] of back.frames) if (!(ref.get(a) ?? new Uint32Array(101)).every((x, i) => x === w[i])) differ++;
          assert.deepEqual([differ, back.frames.size, ref.size], [0, ...P.frames], `${name}: frames not fasm2frames'`);
          const rt = roundTrip(index, fasm, back.frames);
          assert.deepEqual([rt.lost, rt.stray, rt.unknown, rt.missing, rt.extra], [[], [], [], [], []], name);
          assert.deepEqual([rt.counts.aliases, rt.counts.added], [0, { required: P.required ?? 0, pudc: 0, stepdown: 0 }], name);
          assert.ok(rt.counts.pseudoPips > 0 && rt.counts.zeroEncodings > 0, `${name}: ${JSON.stringify(rt.counts)}`);
          // its pins (#3145): each port's IOB at its XDC pin, its direction and IO standard the XDC's, no other IOB configured
          const netlist = fs.readFileSync(path.join(dir, r.files.netlist), 'utf8');
          const pins = xdcPins(readXdc(fs.readFileSync(path.join(dir, project.constraints), 'utf8')), netlist, project.top);
          assert.deepEqual(checkPins(db.pins, pins, ioConfig(rt.features)), { ok: true, checked: PINS[name], errors: [] }, name);
          // (no ISE file in the build folder, the XDC's name kept)
          const build = fs.readdirSync(path.join(dir, 'build'));
          assert.ok(build.includes(path.basename(project.constraints)), build.join(' '));
          assert.deepEqual(build.filter(f => /\.(xst|prj|ut|ucf|sh)$/.test(f)), []);
        });
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
}
