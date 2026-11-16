// The MCP server's KiCad parts (#4280, server/mcp-kicad.js, server/mcp-circuit.js): import_part copies a library and a
// footprint of the exchange folder into parts/ (the Silinx properties written in its symbols, the rest as it was), each
// symbol said; circuit_parts with the project lists them; edit_circuit places them, check_drawing and the HDL file take
// them; simulate_drawing runs them; what import_part refuses
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp, ex;
const FIX = new URL('./fixtures/kicad/project/parts/', import.meta.url);
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-kicad-'));
  ex = path.join(tmp, 'exchange');
  process.env.SILINX_MCP_FOLDER = ex;
  fs.mkdirSync(ex, { recursive: true });
  fs.copyFileSync(new URL('ttl.kicad_sym', FIX), path.join(ex, 'ttl.kicad_sym'));
  fs.copyFileSync(new URL('imported.pretty/Module_1x04.kicad_mod', FIX), path.join(ex, 'Module_1x04.kicad_mod'));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, text) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${text}`); return r; };
const read = (rel) => fs.readFileSync(path.join(tmp, 'ws', 'k', rel), 'utf8');
const T = (s) => `parts/ttl.kicad_sym#${s}`;

test('import_part: a footprint, then a library and its symbols said, its Silinx properties written; circuit_parts with the project', async () => {
  await ok('new_project', { name: 'k' });
  await ok('new_source', { project: 'k', type: 'circuit', name: 'kc', language: 'vhdl' });
  const fp = await ok('import_part', { project: 'k', file: 'Module_1x04.kicad_mod' });
  assert.equal(fp.text, 'parts/imported.pretty/Module_1x04.kicad_mod written');
  assert.equal(read('parts/imported.pretty/Module_1x04.kicad_mod'), fs.readFileSync(path.join(ex, 'Module_1x04.kicad_mod'), 'utf8'), 'as it was');
  const r = await ok('import_part', { project: 'k', file: 'ttl.kicad_sym', symbols: { '74LS04': { model: '7404' }, SENSOR: { footprint: 'PinHeader_1x04_P2.54mm_Vertical' } }, licence: 'CC-BY-4.0', source: 'a test library' });
  assert.deepEqual(r.text.split('\n'), ['parts/ttl.kicad_sym written (its symbols\' Silinx properties set)',
    `${T('74LS00')}: behaves as the 7400 (by its part number)`, `${T('74HC00')}: behaves as the 7400 (by its part number)`, `${T('MYNAND')}: behaves as the 7400 (by its Silinx.Model)`,
    `${T('CD4011')}: behaves as the 4011 (by its part number)`, `${T('SENSOR')}: drawn only: not simulated`, `${T('MODULE')}: drawn only: not simulated`,
    `${T('74LS04')}: not a part: its Silinx.Model is 7404 but its pin 2 (no name) is input, the 7404's pin 2 (1Y) out`,
    `${T('SMDCHIP')}: not a part: its footprint Package_SO:SOIC-8_3.9x4.9mm_P1.27mm is surface-mount: it does not plug into a breadboard`,
    `${T('NOFP')}: not a part: it has no footprint: give it Silinx.Footprint (DIP-14_W7.62mm, PinHeader_1x04_P2.54mm)`,
    `${T('BADMODEL')}: not a part: its Silinx.Model 'led' is not an IC of the library`]);
  assert.deepEqual(r.data.parts.map((p) => [p.value, p.kind, p.behavesAs]), [['SN74LS00N', 'ic', '7400'], ['74HC00', 'ic', '7400'], ['MYNAND', 'ic', '7400'], ['CD4011BE', 'ic', '4011'],
    ['TEST-SENSOR', 'drawn', null], ['TEST-MODULE', 'drawn', null]]);
  assert.equal(r.data.untrusted.content, 'the library\'s names and texts');
  // the file: KiCad's, its symbols' Silinx properties added (the source and licence on those that are not derived)
  const lib = read('parts/ttl.kicad_sym'), orig = fs.readFileSync(path.join(ex, 'ttl.kicad_sym'), 'utf8');
  const added = lib.split('\n').filter((l) => !orig.split('\n').includes(l));
  assert.equal(added.filter((l) => l.includes('"Silinx.Licence" "CC-BY-4.0"')).length, 10, 'every symbol but the derived 74HC00');
  assert.equal(added.filter((l) => l.includes('"Silinx.Source" "a test library"')).length, 10);
  assert.deepEqual(added.filter((l) => /Model|Footprint/.test(l)).map((l) => l.trim()), ['(property "Silinx.Model" "7404" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))',
    '(property "Silinx.Footprint" "PinHeader_1x04_P2.54mm_Vertical" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))']);
  assert.equal(orig.split('\n').filter((l) => !lib.split('\n').includes(l)).length, 0, 'nothing of KiCad\'s changed');

  const list = await ok('circuit_parts', { project: 'k' });
  assert.deepEqual(list.text.split('\n').slice(-10, -1).map((l) => l.replace(/; pins .*/, '')), [
    `${T('74LS00')}: Quad 2-input NAND [KiCad SN74LS00N, as the 7400] (SN74LS00, 10 ns)`, `${T('74HC00')}: Quad 2-input NAND [KiCad 74HC00, as the 7400] (SN74LS00, 10 ns)`,
    `${T('MYNAND')}: Quad 2-input NAND [KiCad MYNAND, as the 7400] (MYNAND, 10 ns)`, `${T('CD4011')}: Quad 2-input NAND [KiCad CD4011BE, as the 4011] (CD4011B, 60 ns)`,
    `${T('SENSOR')}: a sensor module [KiCad TEST-SENSOR, drawn only]`, `${T('MODULE')}: TEST-MODULE [KiCad TEST-MODULE, drawn only]`,
    `${T('74LS04')}: not a part: its Silinx.Model is 7404 but its pin 2 (no name) is input, the 7404's pin 2 (1Y) out`,
    `${T('SMDCHIP')}: not a part: its footprint Package_SO:SOIC-8_3.9x4.9mm_P1.27mm is surface-mount: it does not plug into a breadboard`,
    `${T('NOFP')}: not a part: it has no footprint: give it Silinx.Footprint (DIP-14_W7.62mm, PinHeader_1x04_P2.54mm)`]);
  assert.equal(list.text.split('\n').at(-1), `${T('BADMODEL')}: not a part: its Silinx.Model 'led' is not an IC of the library`);
  assert.match(list.text, new RegExp(`^${T('SENSOR').replace(/[.#]/g, '\\$&')}: .*; pins 1 VCC none, 2 GND none, 3 OUT none, 4 EN none$`, 'm'));
  assert.deepEqual([list.data.project, list.data.skipped.length, list.data.notes, list.data.errors], ['k', 4, [], []]);
  assert.equal(list.data.untrusted.content, 'the project\'s KiCad parts: their names and texts');
  const one = await ok('circuit_parts', { project: 'k', type: T('74HC00') });
  assert.deepEqual(one.text.split('\n').slice(1, 4), ['Behaves as the 7400 of the library (by its part number).',
    'KiCad symbol 74HC00 of parts/ttl.kicad_sym; datasheet https://example.org/74hc00.pdf; from a test library, licence CC-BY-4.0', 'Chip SN74LS00, 74LS (TTL), DIP-14; supply VCC 14, GND 7']);
  assert.deepEqual((await ok('circuit_parts', { project: 'k', type: T('SENSOR') })).text.split('\n').slice(1),
    ['Drawn only: not simulated, its pins drive nothing.', 'KiCad symbol SENSOR of parts/ttl.kicad_sym; from a test library, licence CC-BY-4.0', 'Pins: 1 VCC (not simulated), 2 GND (not simulated), 3 OUT (not simulated), 4 EN (not simulated)']);
  // without the project: the library's only
  const lib0 = await ok('circuit_parts', {});
  assert.ok(!lib0.data.parts.some((p) => p.kicad));
  assert.equal(lib0.data.project, undefined);
  await fails('circuit_parts', { type: T('74HC00') }, `no part '${T('74HC00')}' (the parts: ${lib0.data.parts.map((p) => p.type).join(', ')})`);
});

test('edit_circuit places the project\'s KiCad parts; its check, its HDL file, simulate_drawing', async () => {
  const e = await ok('edit_circuit', { project: 'k', path: 'src/kc.circ.json', operations: [{ op: 'add', type: T('74HC00'), at: [40, 20] }, { op: 'wire', from: 'U1.14', to: 'BB1.tp30' },
    { op: 'wire', from: 'U1.7', to: 'BB1.tn29' }, { op: 'add', type: T('SENSOR'), at: [40, 30] }] });
  assert.deepEqual(e.text.split('\n'), [`U1 (${T('74HC00')}) added`, 'w3 wired from "U1.14" to "BB1.tp30"', 'w4 wired from "U1.7" to "BB1.tn29"', `U2 (${T('SENSOR')}) added`,
    'WARNING: U2 (TEST-SENSOR) is drawn only: it is not simulated and its pins drive nothing', 'Process "Check Circuit" of kc.circ.json completed successfully with 1 warning(s).', 'src/kc.vhd updated from src/kc.circ.json']);
  assert.deepEqual([e.data.errors, e.data.warnings], [[], [{ message: 'U2 (TEST-SENSOR) is drawn only: it is not simulated and its pins drive nothing', item: 'U2' }]]);
  assert.match(read('src/kc.vhd'), /^-- Parts {7}: U1 \(74HC00, as the SN74LS00\), U2 \(TEST-SENSOR, drawn only\)$/m);
  assert.match(read('src/kc.vhd'), /^entity kc_sn74ls00 is$/m);
  assert.equal(JSON.parse(read('src/kc.circ.json')).parts.find((p) => p.id === 'U1').type, T('74HC00'), 'the file names the part by its library and symbol');
  assert.equal((await ok('check_drawing', { project: 'k', file: 'src/kc.circ.json' })).text,
    'WARNING: U2 (TEST-SENSOR) is drawn only: it is not simulated and its pins drive nothing\nProcess "Check Circuit" of kc.circ.json completed successfully with 1 warning(s).');
  assert.equal((await ok('simulate_drawing', { project: 'k', file: 'src/kc.circ.json', cycles: [{}] })).text, 'kc.circ.json from time 0, 1 step(s):\nstart: t = 10 ns; LEDs none\nstep 0: inputs none; t = 10 ns; LEDs none');
  // its library removed: the part is no more, the check says it
  fs.rmSync(path.join(tmp, 'ws', 'k', 'parts', 'ttl.kicad_sym'));
  const gone = await ok('check_drawing', { project: 'k', file: 'src/kc.circ.json' });
  assert.match(gone.text, new RegExp(`^ERROR: U1: no part '${T('74HC00').replace(/[.#]/g, '\\$&')}' in the library$`, 'm'));
});

test('import_part refuses: a file there already (unless replace), a symbol it has not, a model that is no IC, other files', async () => {
  await ok('import_part', { project: 'k', file: 'ttl.kicad_sym' });
  await fails('import_part', { project: 'k', file: 'ttl.kicad_sym' }, 'parts/ttl.kicad_sym: the project has it already (replace: true replaces it)');
  const again = await ok('import_part', { project: 'k', file: 'ttl.kicad_sym', replace: true, name: 'ttl.kicad_sym' });
  assert.equal(again.text.split('\n')[0], 'parts/ttl.kicad_sym written');
  await fails('import_part', { project: 'k', file: 'ttl.kicad_sym', name: 'other.kicad_sym', symbols: { NONE: { model: '7400' } } },
    'symbols: no symbol \'NONE\' in the library (its symbols: 74LS00, 74HC00, MYNAND, CD4011, 74LS04, SENSOR, MODULE, SMDCHIP, NOFP, BADMODEL, VCC)');
  await fails('import_part', { project: 'k', file: 'ttl.kicad_sym', name: 'other.kicad_sym', symbols: { NOFP: { model: 'led' } } }, 'symbols.NOFP.model: \'led\' is not an IC of the library (circuit_parts)');
  await fails('import_part', { project: 'k', file: 'ttl.kicad_sym', name: '../x.kicad_sym' }, 'name: \'../x.kicad_sym\' is not a .kicad_sym nor a .kicad_mod file\'s name (letters, digits, . _ -)');
  await fails('import_part', { project: 'k', file: 'Module_1x04.kicad_mod', symbols: { A: {} } }, 'symbols: a footprint has none');
  fs.writeFileSync(path.join(ex, 'notes.txt'), 'x');
  await fails('import_part', { project: 'k', file: 'notes.txt' }, 'file: \'notes.txt\' is not a .kicad_sym nor a .kicad_mod file\'s name (letters, digits, . _ -)');
  fs.writeFileSync(path.join(ex, 'old.kicad_sym'), 'EESchema-LIBRARY Version 2.4\n');
  await fails('import_part', { project: 'k', file: 'old.kicad_sym' }, 'a KiCad 5 symbol library (.lib): open it in KiCad 6 or later and save it as a .kicad_sym');
  fs.writeFileSync(path.join(ex, 'bad.kicad_mod'), '(kicad_symbol_lib)');
  await fails('import_part', { project: 'k', file: 'bad.kicad_mod' }, 'not a KiCad footprint: it does not start with (footprint');
  await fails('import_part', { project: 'k', file: 'absent.kicad_sym' }, 'file: no file \'absent.kicad_sym\' in the exchange folder');
  assert.ok(!fs.existsSync(path.join(tmp, 'ws', 'k', 'parts', 'other.kicad_sym')), 'nothing written by a refusal');
});
