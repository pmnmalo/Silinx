// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The MCP server's set_notation (#3915, server/mcp-notation.js): the notation of the Boolean expressions it shows, as
// the interface's Settings ▸ Boolean Notation; none set, Electronics / Engineering; set (kept in config.json), read
// back, the same again, refused; related_view's results and set_output_logic in it, or in the one a call names; the
// conditions convert_module, convert_drawing and related_view's state diagram write in it (part 2).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { newTable, normalizeTable } from '../core/logic.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-notation-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const B = '̅';
const config = () => { try { return JSON.parse(fs.readFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), 'utf8')); } catch { return {}; } };

test('#3915 set_notation: Electronics / Engineering by default; set, kept, read back; the results and an output\'s logic in it', async () => {
  await ok('new_project', { name: 'n' });
  // f = /a.b + c: its minimal SOP
  const t = normalizeTable({ ...newTable('f1', ['a', 'b', 'c'], ['f']), table: { f: '01110101' } });
  await ok('write_file', { project: 'n', path: 'src/f1.bool.json', text: JSON.stringify(t, null, 2) });
  const sop = async (args = {}) => (await ok('related_view', { project: 'n', path: 'src/f1.bool.json', view: 'results', ...args })).data.outputs[0].minimalSop;
  // none set: the default
  assert.deepEqual(await ok('set_notation', {}), { isError: false, text: `Boolean notation: Electronics / Engineering (a${B}·b + c)`, data: { notation: 'engineering' } });
  assert.equal(config().notation, undefined);
  const s0 = await sop();
  assert.equal(JSON.stringify(s0).includes(`a${B}·b`), true, JSON.stringify(s0));
  // set: kept in config.json, read back, the results in it
  assert.deepEqual(await ok('set_notation', { notation: 'logic' }), { isError: false, text: 'Boolean notation: Logic / Set theory (¬a ∧ b ∨ c)', data: { notation: 'logic' } });
  assert.equal(config().notation, 'logic');
  assert.deepEqual((await ok('set_notation', {})).data, { notation: 'logic' });
  assert.deepEqual(await ok('set_notation', { notation: 'logic' }), { isError: false, text: 'Boolean notation: already Logic / Set theory (¬a ∧ b ∨ c)', data: { notation: 'logic' } });
  const r = await ok('related_view', { project: 'n', path: 'src/f1.bool.json', view: 'results' });
  assert.equal(r.data.notation, 'logic');
  assert.match(r.text, /f = ¬a ∧ b ∨ c|f = c ∨ ¬a ∧ b/);
  // a call's own notation wins
  assert.match((await ok('related_view', { project: 'n', path: 'src/f1.bool.json', view: 'results', notation: 'slash' })).text, /f = \/a\.b \+ c|f = c \+ \/a\.b/);
  // set_output_logic: the expression in the notation set
  const o = await ok('set_output_logic', { project: 'n', path: 'src/f1.bool.json', output: 'f', form: 'sop' });
  assert.match(o.data.expr, /^f = (¬a ∧ b ∨ c|c ∨ ¬a ∧ b)$/);
  // each notation
  for (const [n, re] of [['engineering', new RegExp(`a${B}·b`)], ['vhdl', /not a and b/], ['verilog', /~a & b/], ['slash', /\/a\.b/]]) {
    await ok('set_notation', { notation: n });
    assert.match((await ok('set_output_logic', { project: 'n', path: 'src/f1.bool.json', output: 'f', form: 'sop' })).data.expr, re, n);
  }
  // refused: not a notation (the schema's enum and the tool's own check)
  const bad = await call('set_notation', { notation: 'latex' });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /notation/);
  assert.equal(config().notation, 'slash');
});

test('#3915 the conversions write their conditions in the notation set: convert_module, convert_drawing, related_view', async () => {
  const { fsmFromHdl, asmToFsm, parseCond, isOtherwise } = await import('../core/fsm.js');
  const { asmFromHdl } = await import('../core/asm-from-hdl.js');
  const { showCond } = await import('../core/expr-notation.js');
  const shown = (text, n) => (isOtherwise(text) ? text : showCond(parseCond(text).ast, n));
  // the traffic example's controller as a plain HDL module (no drawing it is made from)
  const vhd = fs.readFileSync(new URL('../examples/traffic/src/traffic.vhd', import.meta.url), 'utf8');
  await ok('new_project', { name: 'tc' });
  await ok('write_file', { project: 'tc', path: 'src/traffic.vhd', text: vhd });
  const read = async (p) => JSON.parse((await ok('read_file', { project: 'tc', path: p })).text);
  const dec = (a) => a.nodes.filter((x) => x.type === 'decision').map((x) => x.cond);
  await ok('set_notation', { notation: 'logic' });
  // the module made a state diagram, then an ASM chart
  let r = await ok('convert_module', { project: 'tc', module: 'traffic', to: 'fsm' });
  const conds = (await read(r.data.drawing)).transitions.map((t) => t.cond);
  assert.deepEqual(conds, fsmFromHdl(vhd, { path: 'traffic.vhd' }).model.transitions.map((t) => shown(t.cond, 'logic')));
  assert.ok(conds.some((c) => /[¬∧∨]/.test(c)), conds.join(' | '));
  await ok('delete_file', { project: 'tc', path: r.data.drawing });
  r = await ok('convert_module', { project: 'tc', module: 'traffic', to: 'asm' });
  const asm = await read(r.data.drawing);
  assert.deepEqual(dec(asm), dec(asmFromHdl(vhd, { path: 'traffic.vhd' }).model).map((c) => shown(c, 'logic')));
  // the ASM chart's state diagram (related_view) and the chart made a state diagram (convert_drawing): in Verilog's
  await ok('set_notation', { notation: 'verilog' });
  const want = asmToFsm(asm).transitions.map((t) => shown(t.cond, 'verilog'));
  assert.ok(want.some((c) => /~|&|\|/.test(c)), want.join(' | '));
  const view = await ok('related_view', { project: 'tc', path: r.data.drawing, view: 'fsm' });
  assert.deepEqual(view.data.model.transitions.map((t) => t.cond), want);
  const made = await ok('convert_drawing', { project: 'tc', path: r.data.drawing, to: 'fsm' });
  assert.deepEqual((await read(made.data.made[0])).transitions.map((t) => t.cond), want);
});
