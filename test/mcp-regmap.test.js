// The MCP server and a register map (#5288, #2674): new_source regmap (the map and its HDL file, the slave), the map
// edited through write_file as its editor saves it (its HDL file made again: the I²C slave at its address), its Check
// (check_drawing: no problems, then an overlap, exact), its header (related_view's header, the text the editor's Header button writes;
// its refusals: not a map, a map in error), Check Syntax of its HDL clean.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { readRegmap, writeRegmap } from '../core/regmap.js';
import { regmapHeader } from '../core/regmap-c.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-regmap-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const read = (f) => fs.readFileSync(path.join(tmp, 'ws', 'rm', f), 'utf8');

test('#5288 MCP: a register map made, edited through write_file, checked, its HDL in sync, its header written', async () => {
  await ok('new_project', { name: 'rm' });
  const n = await ok('new_source', { project: 'rm', type: 'regmap', name: 'pwm_regs' });
  assert.equal(n.text, 'Created Register Map \'src/pwm_regs.regs.json\'.\nsrc/pwm_regs.vhd generated from src/pwm_regs.regs.json');
  assert.match(read('src/pwm_regs.vhd'), /^entity pwm_regs is$/m);
  // edited as its editor saves it: I²C at 0x21, a second register
  const m = readRegmap(read('src/pwm_regs.regs.json')).regmap;
  const edited = { ...m, bus: 'i2c', address: 0x21, registers: [...m.registers, { name: 'count', addr: 1, width: 16, access: 'ro' }] };
  await ok('write_file', { project: 'rm', path: 'src/pwm_regs.regs.json', text: writeRegmap(edited) });
  assert.match(read('src/pwm_regs.vhd'), /-- Bus {9}: I2C at the address 0x21:/);
  assert.match(read('src/pwm_regs.vhd'), /count +: in +STD_LOGIC_VECTOR \(15 downto 0\)/);
  assert.deepEqual((await ok('check_drawing', { project: 'rm', file: 'src/pwm_regs.regs.json' })).text, 'Process "Check Register Map" of pwm_regs.regs.json completed successfully.');
  assert.match((await ok('check_syntax', { project: 'rm', top: 'pwm_regs' })).text, /^Process "Check Syntax" of <pwm_regs> completed successfully \(\d+ signals, \d+ process(es)?\)\.$/);
  // its header (related_view's), as the editor's Header button writes it: written by write_file
  const h = await ok('related_view', { project: 'rm', path: 'src/pwm_regs.regs.json', view: 'header' });
  assert.deepEqual([h.data.name, h.data.view], ['pwm_regs.h', 'header']);
  assert.equal(h.data.text, regmapHeader(readRegmap(read('src/pwm_regs.regs.json')).regmap).code);
  // an overlap: check_drawing's error; no header then
  await ok('write_file', { project: 'rm', path: 'src/pwm_regs.regs.json', text: writeRegmap({ ...edited, registers: [...edited.registers, { name: 'mode', addr: 2, width: 8 }] }) });
  const c = await ok('check_drawing', { project: 'rm', file: 'src/pwm_regs.regs.json' });
  assert.deepEqual([c.text.split('\n'), c.data.ok], [['ERROR: mode and count both at address 2', 'Process "Check Register Map" of pwm_regs.regs.json failed (1 error(s), 0 warning(s)).'], false]);
  const refused = async (args, text) => { const r = await call('related_view', { project: 'rm', view: 'header', ...args }); assert.deepEqual([r.isError, r.text], [true, `related_view: ${text}`]); };
  await refused({ path: 'src/pwm_regs.regs.json' }, 'src/pwm_regs.regs.json: mode and count both at address 2: no header');
  await refused({ path: 'src/pwm_regs.vhd' }, 'src/pwm_regs.vhd: a register map (.regs.json) has a header');
});
