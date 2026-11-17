// scripts/check-xc7.mjs (npm run check:xc7, #3145): the 7-series' open flow checked with no Vivado: its options, its
// report's lines, a run on an example (gates on the Basys 3) and on its project folder, and checkBuild on a build whose
// XDC moves a pin afterwards (the .bit's IOB not at the XDC's pin, the XDC's pin's IOB not configured).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, reportLine, checkBuild } from '../scripts/check-xc7.mjs';
import { exampleProject } from './examples-lib.mjs';
import { runOpenImplementation } from '../server/open-flow.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-xc7.mjs');

test('parseArgs: the boards, the filter, --vivado and project folders; an unknown option, a missing value, the examples\' options with a folder: errors', () => {
  assert.deepEqual(parseArgs([]), { boards: null, filter: null, vivado: false, folders: [] });
  assert.deepEqual(parseArgs(['--boards', 'basys3', '--filter', '^gates$', '--vivado']), { boards: 'basys3', filter: '^gates$', vivado: true, folders: [] });
  assert.deepEqual(parseArgs(['a', 'b']), { boards: null, filter: null, vivado: false, folders: ['a', 'b'] });
  assert.deepEqual(parseArgs(['--board', 'basys3']), { error: 'unknown option --board' });
  assert.deepEqual(parseArgs(['--filter']), { error: '--filter: a value is missing' });
  assert.deepEqual(parseArgs(['--boards', '--vivado']), { error: '--boards: a value is missing' });
  assert.deepEqual(parseArgs(['a', '--boards', 'basys3']), { error: '--boards and --filter are for the examples, not a project folder' });
});

test('reportLine: ok with the checks\' counts, FAILED with each error; the open flow\'s warnings after it', () => {
  const r = { ok: true, errors: [], frames: { read: 5408, reference: 4974, differ: 0 }, roundTrip: { counts: { features: 107, read: 186 } }, pins: { checked: 6 } };
  assert.equal(reportLine('basys3-gates', r), 'basys3-gates: ok (4974 frames fasm2frames\', round trip by bits: the FASM\'s 107 bits, 186 features read back; 6 pins)');
  assert.equal(reportLine('x', { ...r, ok: false, errors: ['a', 'b'] }, ['WARNING: w']), 'x: FAILED\n  a\n  b\n  open flow: WARNING: w');
  assert.match(reportLine('x', { ...r, pins: null }), /; 0 pins\)$/);
});

test('npm run check:xc7 on gates on the Basys 3, and on its project folder: every check passed, no warning; a project whose XDC moved a pin after its build: FAILED', async () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--boards', 'basys3', '--filter', '^gates$'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), ['basys3-gates: ok (4974 frames fasm2frames\', round trip by bits: the FASM\'s 107 bits, 186 features read back; 6 pins)', 'all checks passed']);
  assert.equal(r.stderr, '');
  // a built project, its XDC's first pin moved to another IOB: the .bit's checked against it
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-check-xc7-'));
  try {
    const { dir, project } = exampleProject('gates', { board: 'basys3' }, tmp);
    const job = { log: () => {}, result: null, cancelled: false, procs: new Set() };
    await runOpenImplementation(job, { project, projectDir: dir, steps: ['synth', 'translate', 'par', 'trce', 'bitgen'] });
    assert.equal((await checkBuild(dir, project, 'xc7a35tcpg236-1')).ok, true);
    // (the folder: built again on a copy, the same)
    const f = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    assert.equal(f.status, 0, f.stderr);
    assert.deepEqual(f.stdout.trim().split('\n'), [`${path.basename(dir)}: ok (4974 frames fasm2frames', round trip by bits: the FASM's 107 bits, 186 features read back; 6 pins)`, 'all checks passed']);
    const xdc = path.join(dir, project.constraints), text = fs.readFileSync(xdc, 'utf8');
    const [, pin, port] = /PACKAGE_PIN (\w+) IOSTANDARD \w+ \} \[get_ports \{([^}]+)\}\]/.exec(text);
    assert.notEqual(pin, 'W5');
    fs.writeFileSync(xdc, text.replace(`PACKAGE_PIN ${pin} `, 'PACKAGE_PIN W5 '));
    const c = await checkBuild(dir, project, 'xc7a35tcpg236-1');
    assert.equal(c.ok, false);
    assert.equal(c.errors.length, 2, c.errors.join('\n'));
    assert.match(c.errors[0], new RegExp(`^pins: ${port.replace(/[[\]]/g, '\\$&')} \\(W5, RIOB33_X43Y25\\.IOB_Y0\\): an \\w+ with no `));
    assert.match(c.errors[1], new RegExp(`^pins: \\w+\\.IOB_Y[01] \\(${pin}\\): an IOB the \\.bit configures, no port's in the XDC$`));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
