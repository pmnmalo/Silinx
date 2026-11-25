// readPins and writePins moved to core/constraints-format.js (#5588), a move that changes nothing: on every constraints
// file of the repository (its UCFs), read on a Spartan-3E, then written and read again in each family's format (the
// iCE40's PCF, the ECP5's LPF, the Gowin's CST, the GateMate's CCF, the 7-series' XDC), core's module gives what the
// interface's web/js/constraints-format.js gives; that module still exports every name it did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import './ui/core-hooks.js';
import { readPins, writePins } from '../core/constraints-format.js';
import { resolveBoard } from '../core/devices.js';
import { ROOT } from './examples-lib.mjs';

const web = await import('../web/js/constraints-format.js');
const UCFS = execFileSync('git', ['ls-files', '*.ucf'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const DEVICES = Object.fromEntries(['basys2', 'icebreaker', 'ulx3s', 'tangnano9k', 'gatemate-evb', 'basys3'].map(b => [b, resolveBoard(b).device]));

test('#5588 web/js/constraints-format.js still exports every name it did, readPins and writePins core\'s', () => {
  assert.deepEqual(Object.keys(web).sort(), ['ccfDiagnostics', 'constraintsExt', 'constraintsForDevice', 'cstDiagnostics', 'lpfDiagnostics', 'pcfDiagnostics', 'readPins', 'writePins', 'xdcDiagnostics']);
  assert.equal(typeof web.readPins, 'function');
  assert.equal(typeof web.writePins, 'function');
});

test('#5588 readPins and writePins: the same on the repository\'s constraints, in every family\'s format', () => {
  assert.ok(UCFS.length > 50, `${UCFS.length} UCF files`);
  let checked = 0;
  for (const f of UCFS) {
    const text = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
    let m;
    try { m = web.readPins(DEVICES.basys2, text); } catch (e) { assert.throws(() => readPins(DEVICES.basys2, text), { message: e.message }, f); continue; }
    assert.deepEqual(readPins(DEVICES.basys2, text), m, f);
    for (const [board, d] of Object.entries(DEVICES)) {
      const model = { assignments: m.assignments, clocks: m.clocks, header: `${f} on ${board}` };
      const out = web.writePins(d, model);
      assert.equal(writePins(d, model), out, `${f} written for ${board}`);
      let back;
      try { back = web.readPins(d, out); } catch (e) { assert.throws(() => readPins(d, out), { message: e.message }, `${f} read for ${board}`); continue; }
      assert.deepEqual(readPins(d, out), back, `${f} read for ${board}`);
      checked++;
    }
  }
  assert.ok(checked > 300, `${checked} checked`);
});
