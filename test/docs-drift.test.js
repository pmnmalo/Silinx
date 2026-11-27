// The docs and the comments that said what the code no longer does (#5913, found by the architecture audit #5902): each
// statement checked against the code, so it cannot drift again unseen. A new project's Optimization (docs/PROJECT.md:
// core/project-defaults.js NEW_IMPL's), the System document's version (core/system-doc.js's header: SYSTEM_VERSION),
// the PIC24's emulator (docs/ARCHITECTURE.md: the package the code uses), a module the architecture names (one the
// application imports), the circuit node's fidelity notes (its analog parts are solved).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NEW_IMPL } from '../core/project-defaults.js';
import { SYSTEM_VERSION } from '../core/system-doc.js';
import { CIRCUIT_FIDELITY } from '../core/system-sim-circuit.js';

const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('#5913 docs/PROJECT.md names the Optimization a new project has (Speed 1: Fast)', () => {
  assert.deepEqual([NEW_IMPL.optMode, NEW_IMPL.optLevel], ['Speed', 1]);
  const doc = read('docs/PROJECT.md').replace(/\s+/g, ' ');
  assert.match(doc, /`Speed` and 1 \*\*Fast\*\* \(the default of a new project/);
  assert.doesNotMatch(doc, /\*\*Area\*\* \(the default of a new project/);
});

test('#5913 core/system-doc.js\'s header shows the System document\'s version', () => {
  assert.equal(SYSTEM_VERSION, 2);
  assert.match(read('core/system-doc.js'), new RegExp(`\\{ format: 'silinx-system', version: ${SYSTEM_VERSION}, name,`));
});

test('#5913 docs/ARCHITECTURE.md: the PIC24\'s emulator is the package the code uses; the scheduler\'s modules are the application\'s', () => {
  const doc = read('docs/ARCHITECTURE.md');
  assert.match(read('core/system-sim-pic24.js'), /packages\/silinx-pic24\//);
  assert.match(doc, /packages\/silinx-pic24 {2}the PIC24's emulator, Silinx's own/);
  assert.doesNotMatch(doc, /\(possible\)|being\s+evaluated \(#5480\)/);
  // (core/system-sim-remote.js: a host only a test imports, core/system-host.js the application's)
  assert.doesNotMatch(doc, /system-sim-remote\.js/);
  assert.doesNotMatch(read('core/system-sim.js'), /system-sim-remote\.js/);
});

test('#5913 the circuit node\'s fidelity notes: its analog parts solved, a digital net\'s levels only', () => {
  assert.match(read('core/circuit-sim.js'), /isAnalogCircuit\(m\) \? createCircuitAnalog\(/);
  assert.deepEqual(CIRCUIT_FIDELITY.map(n => n.kind), ['models', 'models', 'approximates', 'omits']);
  assert.ok(!CIRCUIT_FIDELITY.some(n => n.kind === 'omits' && /^analog/.test(n.text)), 'not "omits analog"');
  assert.match(CIRCUIT_FIDELITY[1].text, /analog part/);
});
