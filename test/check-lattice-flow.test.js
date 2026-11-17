// What proves an iCE40 or ECP5 build (#2301: scripts/check-lattice-flow.mjs, npm run check:lattice-flow): blinky on the iCEBreaker
// and on the ULX3S, built as the application builds it, its timing met, its bitstream read back and packed again by IceStorm's /
// Trellis's tools the same bytes, its Post-Place & Route model running its test bench as its RTL does; a bitstream its tools write again otherwise and a
// model that fails its test bench each said.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FAMILIES, checkExample, roundTrip, simulateModel } from '../scripts/check-lattice-flow.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-lattice-check-test-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const kept = {};
for (const family of Object.keys(FAMILIES)) {
  test(`blinky on the ${FAMILIES[family].board}: built, its timing met, its bitstream's round trip the same bytes, its post-route model passes its test bench`, { timeout: 600000 }, async () => {
    const r = await checkExample('blinky', family, tmp);
    assert.deepEqual([r.ok, r.build, r.timing, r.clocks, r.bitstream, r.model, r.rtlPasses, r.failures], [true, true, true, 1, true, true, true, []]);
    kept[family] = path.join(tmp, `blinky-${FAMILIES[family].board}`, 'build');
  });
}

test('a bitstream another than its tools pack again is said; a model that fails its test bench is said, with its errors', { timeout: 600000 }, async () => {
  assert.ok(kept.ice40, 'the iCEBreaker\'s build above');
  const bin = fs.readFileSync(path.join(kept.ice40, 'top.bin'));
  assert.deepEqual(await roundTrip('ice40', bin), { same: true, size: bin.length });
  // (a bitstream with a byte of padding more after its end: icepack writes it again without it)
  assert.equal((await roundTrip('ice40', Buffer.concat([bin, Buffer.from([0])]))).same, false);
  // the model with its LEDs' outputs inverted (a broken netlist): the test bench's errors
  const model = path.join(kept.ice40, 'netgen', 'par', 'top_timesim.v');
  const broken = path.join(tmp, 'broken.v');
  fs.writeFileSync(broken, fs.readFileSync(model, 'utf8').replace(/assign led\[(\d)\] = (\\led\[\d\]\$pad );/g, 'assign led[$1] = ~$2;'));
  const log = await simulateModel('blinky', broken);
  assert.ok(log.includes('ERROR: knight rider did not reach the MSB'), log.slice(0, 3).join(' | '));
});
