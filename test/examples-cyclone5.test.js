// The examples on the Cyclone V's boards through the Silinx toolchain (#5377, MISTRAL_TARGETS): each example's QSF from the
// board's pins (the DE0-CV's, the DE1-SoC's, the DE10-Nano's), built by synth_intel_alm and nextpnr-mistral (the package
// @silinx/nextpnr-mistral, Mistral's database of their dies) to its .rbf, the board's 50 MHz met; no warnings. The .rbf is
// nextpnr-mistral's: no reference here (Quartus's is another bitstream of the same design), its size the die's.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, MISTRAL_TARGETS, targetName, exampleProject, exampleUcf, silinxFlow } from './examples-lib.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-examples-cyclone5-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// the .rbf of each board's device: the e50f's (the DE0-CV's 5CEBA4) and the sx120f's (the DE1-SoC's 5CSEMA5, the DE10-Nano's 5CSEBA6)
const RBF_BYTES = { 'de0-cv': 2632660, 'de1-soc': 7007204, 'de10-nano': 7007204 };
const MODEL = { 'de0-cv': '5CEBA4F23C7', 'de1-soc': '5CSEMA5F31C6', 'de10-nano': '5CSEBA6U23I7' };

test('the examples\' ports on the Cyclone V\'s boards: every one with a pin', () => {
  for (const t of MISTRAL_TARGETS) for (const name of EXAMPLES) assert.deepEqual(exampleUcf(name, t).unmatched, [], `${name} on the ${t.board}`);
});

// (one at a time: nextpnr-mistral takes about 2 GB on the sx120f)
describe('the examples on the Cyclone V\'s boards', { concurrency: 1 }, () => {
  for (const t of MISTRAL_TARGETS) {
    for (const name of EXAMPLES) {
      test(`example ${name} on the ${targetName(t)}: a QSF from the board, the Silinx toolchain builds its .rbf, 50 MHz met, no warnings`, { timeout: 300000 }, async () => {
        const { dir, project } = exampleProject(name, t, tmp);
        assert.match(project.constraints, /\.qsf$/);
        const job = await silinxFlow(dir, project, ['synth', 'translate', 'par', 'trce', 'bitgen']);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        assert.match(log, /Placed and routed by nextpnr-mistral in /);
        assert.equal(fs.statSync(path.join(dir, 'build', `${project.top}.rbf`)).size, RBF_BYTES[t.board]);
        assert.ok(job.lines.includes(`Bitstream: build/${project.top}.rbf (${RBF_BYTES[t.board]} bytes, nextpnr-mistral's)`), log.slice(-2000));
        assert.ok(log.includes(MODEL[t.board]), `${MODEL[t.board]}: ${log.slice(0, 2000)}`);
        // (gates has no clock)
        if (name === 'gates') assert.doesNotMatch(log, /^Clock /m);
        else assert.match(log, /^Clock clk: [\d.]+ MHz \(met, 50 MHz asked\)$/m);
        assert.deepEqual(job.lines.filter(l => /warning/i.test(l)), []);
      });
    }
  }
});
