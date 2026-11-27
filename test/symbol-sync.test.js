// A module's symbol kept in step with its module's interface (#5872, core/symbol-sync.js, core/drawing-sync.js
// checkDrawings): a symbol of before stamped quietly with its interface's hash; a state diagram replaced on disk with
// another port: its HDL made again, its symbol's pins put in step (the new port on its default side) and said, a
// schematic's instance of it flagged out of date (update_symbols then updates it, the flag gone); the MCP's check_syntax
// says the same lines.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { interfaceHash } from '../core/symbol-sync.js';
import { normalizeSymbol } from '../core/symbol-layout.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-symbol-sync-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
const D = await import('../server/drawing-sync.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return { text: r.content[0].text, data: r.structuredContent };
}
const file = (name, f) => path.join(P.projectDir(name), f);
const read = (name, f) => fs.readFileSync(file(name, f), 'utf8');
const put = (name, f, text) => fs.writeFileSync(file(name, f), text);
const PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'q', dir: 'out', width: 4 }];

test('interfaceHash: the ports\' names, directions, widths and order; a symbol\'s hash kept when read, a wrong one dropped', async () => {
  const h = await interfaceHash(PORTS);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(await interfaceHash(PORTS.map(q => ({ ...q }))), h);
  assert.notEqual(await interfaceHash([PORTS[1], PORTS[0]]), h);
  assert.notEqual(await interfaceHash([PORTS[0], { ...PORTS[1], width: 8 }]), h);
  assert.notEqual(await interfaceHash([PORTS[0], { ...PORTS[1], dir: 'in' }]), h);
  assert.equal(await interfaceHash([{ name: 'a' }]), await interfaceHash([{ name: 'a', dir: 'in', width: 1 }]));
  assert.equal(normalizeSymbol({ module: 'm', pins: [], interface: h }).symbol.interface, h);
  assert.equal(normalizeSymbol({ module: 'm', pins: [], interface: 'nope' }).symbol.interface, undefined);
});

test('Pedro\'s case with its symbol: a state diagram replaced on disk with another port: its symbol put in step, said; a schematic\'s instance of it flagged, update_symbols clears it', async () => {
  await P.createProject({ name: 'sy', template: 'traffic' });
  // its symbol of its own (Symbol Editor's: phase on top), of before #5872 (no hash)
  await call('edit_symbol', { project: 'sy', module: 'traffic', pins: [{ name: 'phase', side: 'N' }] });
  const sym0 = JSON.parse(read('sy', 'src/traffic.sym.json'));
  delete sym0.interface;
  put('sy', 'src/traffic.sym.json', `${JSON.stringify(sym0, null, 1)}\n`);
  // a schematic with an instance of it
  await call('new_source', { project: 'sy', type: 'schematic', name: 'wrap' });
  await call('place_instance', { project: 'sy', path: 'src/wrap.sch.json', module: 'traffic', name: 'u1', x: 200, y: 200 });
  // checked: the symbol stamped quietly
  assert.deepEqual(await D.checkDrawings(P, 'sy'), { results: [{ path: 'src/traffic.sym.json', target: 'src/traffic.sym.json', written: 'src/traffic.sym.json', removed: null, stale: null, messages: [] }], written: ['src/traffic.sym.json'], messages: [] });
  const stamped = JSON.parse(read('sy', 'src/traffic.sym.json'));
  assert.match(stamped.interface, /^[0-9a-f]{16}$/);
  assert.deepEqual(stamped.pins, sym0.pins);
  assert.deepEqual(await D.checkDrawings(P, 'sy'), { results: [], written: [], messages: [] });
  // the state diagram replaced: an input more
  const fsm = JSON.parse(read('sy', 'src/traffic.fsm.json'));
  fsm.inputs.push({ name: 'hold', width: 1 });
  fsm.transitions.find(t => t.id === 't3').cond = 'done && !hold';
  put('sy', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  const r = await call('check_syntax', { project: 'sy', top: 'traffic' });
  assert.deepEqual(r.text.split('\n').slice(0, 3), [
    'src/traffic.vhd updated from src/traffic.fsm.json (the drawing was changed outside Silinx)',
    'src/traffic.sym.json updated: the ports of traffic changed (added hold)',
    'WARNING: src/wrap.sch.json: 1 instance(s) of traffic out of date (S1): Update Symbol (its right-click menu) or update_symbols updates them, their wires kept.']);
  const sym = JSON.parse(read('sy', 'src/traffic.sym.json'));
  assert.deepEqual(sym.pins.map(q => `${q.name}:${q.side}`), [...sym0.pins.map(q => `${q.name}:${q.side}`), 'hold:W']);
  assert.notEqual(sym.interface, stamped.interface);
  // Update Symbol: the instance takes hold; flagged no more
  const u = await call('update_symbols', { project: 'sy', path: 'src/wrap.sch.json' });
  assert.deepEqual(u.data.updated, ['u1']);
  assert.ok(JSON.parse(read('sy', 'src/wrap.sch.json')).symbols.find(s => s.id === 'S1').params.ports.some(q => q.name === 'hold'));
  assert.doesNotMatch((await call('check_syntax', { project: 'sy', top: 'traffic' })).text, /out of date|updated/);
});
