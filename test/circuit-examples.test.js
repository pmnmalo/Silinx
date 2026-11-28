// The Circuit examples (#5757's 4a, roadmap #5753: core/examples.js CIRCUIT_EXAMPLES): each made a Circuit project by the
// MCP (new_project_from_example, Circuit mode its default for a Circuit version), with no board nor constraints and no HDL
// file of its own (its drawings its sources); its design checked with no warning; its test bench simulated, every check
// passed (its own report) with no warning nor error. The listing (list_examples) says each one's modes; an FPGA project
// cannot start from a Circuit version.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { CIRCUIT_EXAMPLES, CIRCUIT_ORDER, exampleModes } from '../core/examples.js';
import { ownSources } from '../core/project-kind.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-circuit-examples-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text.replace(/\n?\[End of untrusted[\s\S]*$/, ''), data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

// each Circuit version: its top, its test bench, what its design's check counts, its test bench's last report
const VERSIONS = {
  'traffic-circuit': ['crossing', 'tb_crossing', '22 signals, 17 processes', '[1697.000 ns] NOTE: tb_crossing: all checks passed'],
  'blinky-circuit': ['knight', 'tb_knight', '9 signals, 15 processes', '[360.000 ns] NOTE: tb_knight: all checks passed'],
  'stopwatch-circuit': ['stopwatch', 'tb_stopwatch', '21 signals, 17 processes', '[2320.000 ns] NOTE: tb_stopwatch: all checks passed'],
  'lock-circuit': ['safe', 'tb_safe', '70 signals, 56 processes', '[970.000 ns] NOTE: tb_safe: all checks passed'],
};

test('#5757 the Circuit examples: gates and breadboard, then the Circuit versions; their modes', () => {
  assert.deepEqual(CIRCUIT_EXAMPLES, ['gates', 'breadboard', 'traffic-circuit', 'blinky-circuit', 'stopwatch-circuit', 'lock-circuit']);
  assert.deepEqual(Object.keys(VERSIONS), CIRCUIT_ORDER);
  assert.deepEqual(CIRCUIT_EXAMPLES.map(exampleModes), [['circuit', 'board'], ['circuit', 'board'], ['circuit'], ['circuit'], ['circuit'], ['circuit']]);
  // (each a Circuit project's as it is shipped: no board, no constraints, no HDL or C of its own)
  for (const n of CIRCUIT_ORDER) {
    const pj = JSON.parse(fs.readFileSync(new URL(`../examples/${n}/silinx.json`, import.meta.url), 'utf8'));
    assert.deepEqual([pj.kind, pj.board, pj.constraints, pj.trusted, pj.madeBy], ['design', null, null, undefined, undefined], n);   // (as shipped, version 1: read as its profile, #5907)
    const drawn = fs.readdirSync(new URL(`../examples/${n}/src`, import.meta.url)).filter(f => /\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(new URL(`../examples/${n}/src/${f}`, import.meta.url), 'utf8')).generatedFile);
    assert.deepEqual(ownSources(pj, drawn), [], `${n}: an HDL file no drawing makes`);
  }
});

for (const [n, [top, simTop, counts, passed]] of Object.entries(VERSIONS)) {
  test(`#5757 ${n}: a Circuit project by default; its design checked, no warning; its test bench passed`, async () => {
    const r = await ok('new_project_from_example', { name: n, example: n });
    assert.deepEqual([r.data.mode, r.data.top, r.data.simTop, r.data.board], ['circuit', top, simTop, null]);
    const pj = await P.readProject(n);
    assert.deepEqual([pj.profile, pj.board, pj.constraints, (await ok('project_info', { project: n })).data.mode], ['logic', null, null, 'circuit']);
    const c = await ok('check_syntax', { project: n });
    assert.equal(c.text, `Process "Check Design" of <${top}> completed successfully (${counts}).`);
    const s = await ok('simulate', { project: n, time_ns: 5000 });
    const lines = s.text.split('\n');
    assert.equal(lines[0], passed);
    assert.deepEqual(lines.filter(l => /WARNING|ERROR|FAILURE/.test(l)), []);
  });
}

test('#5757 gates and breadboard as Circuit projects: their test benches with no warning nor error', async () => {
  for (const n of ['gates', 'breadboard']) {
    await ok('new_project_from_example', { name: `${n}C`, example: n, mode: 'circuit' });
    const s = await ok('simulate', { project: `${n}C`, time_ns: 5000 });
    assert.deepEqual(s.text.split('\n').filter(l => /WARNING|ERROR|FAILURE/.test(l)), [], `${n}: ${s.text.slice(0, 400)}`);
  }
});

test('#5757 list_examples: the Circuit versions said, after the FPGA examples; an FPGA project of one refused', async () => {
  const l = await ok('list_examples', {});
  const names = l.data.examples.map(e => e.name);
  assert.deepEqual(names.filter(x => CIRCUIT_ORDER.includes(x)), CIRCUIT_ORDER);
  assert.ok(names.indexOf('lock') < names.indexOf('traffic-circuit') && names.indexOf('lock-circuit') < names.indexOf('uart-avr'), names.join());
  assert.equal(l.text.split('\n').find(x => x.startsWith('traffic-circuit:')), 'traffic-circuit: a Circuit example (drawings, no board), top crossing, test bench tb_crossing, 4 file(s)');
  assert.deepEqual(l.data.examples.find(e => e.name === 'lock-circuit'), { name: 'lock-circuit', modes: ['circuit'], boardType: null, top: 'safe', simTop: 'tb_safe', board: null, device: null, files: 8 });
  const f = await call('new_project_from_example', { name: 'tf', example: 'traffic-circuit', mode: 'board' });
  assert.deepEqual([f.isError, f.text], [true, 'new_project_from_example: traffic-circuit is not a board example (its modes: circuit)']);
});
