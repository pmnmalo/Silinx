// The rest of Configure Target Device in the MCP server (#4751, server/mcp-board.js): the Platform Flash PROM
// (program_prom: program, verify, read a backup, erase, reconfigure), the JTAG chain's scan (jtag_scan) and the
// bitstream's header (bitstream_info), through the server's functions the interface's iMPACT window calls
// (impl-routes.js startProm, startScan, bitInfo), with a fake adepttool (test/server-helpers.js makeFakes), never a real
// board; their refusals (an untrusted project, no top, the PROM not verified). And toolchain_info: what Toolchain Settings
// found, read only, never a host, a user or a path (the settings are the user's: core/mcp-parity.js).
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, makeFakes, isolatedPath, writeConfig, makeBit, POSIX_ONLY } from './server-helpers.js';

let tmp, fakes, oldPath, P, handle, TOOLS;
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
// (the untrusted content's note left out: the tool's own text)
const own = t => t.replace(/\n*\[End of untrusted content [\s\S]*$/, '');
const ICE40 = { family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' };

async function project(name, board, files = {}, device = null) {
  await P.createProject({ name, board, ...(device && { device }) });
  await P.updateProject(name, pj => { pj.top = 'top'; });
  for (const [f, data] of Object.entries(files)) {
    await fs.mkdir(path.join(P.projectDir(name), 'build'), { recursive: true });
    await fs.writeFile(path.join(P.projectDir(name), 'build', f), data);
  }
}
const progLog = () => fs.readFile(process.env.FAKE_PROG_LOG, 'utf8');

before(async () => {
  tmp = await scratchEnv('silinx-mcp-target-');
  fakes = await makeFakes(tmp);
  oldPath = process.env.PATH;
  process.env.PATH = isolatedPath(fakes.prog);
  await writeConfig({ paths: { adepttool: fakes.adept } });
  ({ handle, TOOLS } = await import('../server/mcp.js'));
  P = await import('../server/projects.js');
});
afterEach(() => { for (const k of ['FAKE_PROG_LOG', 'FAKE_XCF_NOVERIFY', 'FAKE_ADEPT_FAIL', 'FAKE_ADEPT_NODONE']) delete process.env[k]; });
after(async () => { process.env.PATH = oldPath; await fs.rm(tmp, { recursive: true, force: true }); });

test('#4751 the new tools: program_prom destructive, the others read only; their arguments', () => {
  const t = Object.fromEntries(TOOLS.filter(x => ['program_prom', 'jtag_scan', 'bitstream_info', 'toolchain_info'].includes(x.name)).map(x => [x.name, x]));
  assert.deepEqual(Object.keys(t).sort(), ['bitstream_info', 'jtag_scan', 'program_prom', 'toolchain_info']);
  assert.deepEqual(t.program_prom.annotations, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });
  assert.deepEqual(t.program_prom.inputSchema.required, ['project', 'op']);
  assert.deepEqual(t.program_prom.inputSchema.properties.op.enum, ['program', 'verify', 'read', 'erase', 'reconfigure']);
  for (const n of ['jtag_scan', 'bitstream_info', 'toolchain_info']) assert.equal(t[n].annotations.readOnlyHint, true, n);
  assert.deepEqual(Object.keys(t.toolchain_info.inputSchema.properties), []);
});

test('#4751 program_prom: program (verified), verify, read a backup, erase, reconfigure, as iMPACT\'s window', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'prom.log');
  await project('Prom', 'basys2', { 'top_prom.bit': makeBit({ design: 'top.ncd' }) });
  const p = await call('program_prom', { project: 'Prom', op: 'program' });
  assert.equal(p.isError, false, p.text);
  assert.equal(p.text.split('\n')[0], 'The PROM programmed and verified.');
  assert.deepEqual([p.data.op, p.data.ok, p.data.backup], ['program', true, undefined]);
  assert.match(await progLog(), /xcf_prog\.py --device 0 program .*top_prom\.bit$/m);
  const pr = await call('program_prom', { project: 'Prom', op: 'program', verify: false, reconfigure: true });
  assert.equal(pr.text.split('\n')[0], 'The PROM programmed; FPGA loaded from the PROM (DONE).');
  assert.match(await progLog(), /program .*top_prom\.bit --no-verify --reconfigure$/m);
  assert.equal((await call('program_prom', { project: 'Prom', op: 'verify' })).text.split('\n')[0], 'The PROM verified: contents match.');
  const r = await call('program_prom', { project: 'Prom', op: 'read' });
  assert.match(r.text.split('\n')[0], /^PROM backup saved in build\/prom-backup\/prom-[\dTZ-]+\.bin\.$/);
  assert.equal(await fs.readFile(path.join(P.projectDir('Prom'), r.data.backup), 'utf8'), 'PROMDATA');
  assert.equal((await call('program_prom', { project: 'Prom', op: 'erase' })).text.split('\n')[0], 'The PROM erased.');
  assert.equal((await call('program_prom', { project: 'Prom', op: 'reconfigure' })).text.split('\n')[0], 'FPGA loaded from the PROM (DONE).');
  // (no path of the workspace's folder in its result)
  assert.ok(!JSON.stringify(r).includes(tmp), JSON.stringify(r));
});

test('#4751 program_prom\'s refusals: untrusted, no top, not verified, the FPGA not loaded, a wrong op', { skip: POSIX_ONLY }, async () => {
  await project('PromU', 'basys2', { 'top_prom.bit': makeBit() });
  await P.updateProject('PromU', pj => ({ ...pj, trusted: false, madeBy: 'mcp' }));
  const u = await call('program_prom', { project: 'PromU', op: 'erase' });
  assert.equal(u.isError, true);
  assert.match(u.text, /^program_prom: project 'PromU' .*: programming the PROM runs only once you trust it/);
  await P.createProject({ name: 'PromNoTop', board: 'basys2' });
  assert.equal((await call('program_prom', { project: 'PromNoTop', op: 'program' })).text, 'program_prom: project has no top module; cannot locate build/<top>_prom.bit');
  await project('PromV', 'basys2', { 'top_prom.bit': makeBit() });
  process.env.FAKE_XCF_NOVERIFY = '1';
  const v = await call('program_prom', { project: 'PromV', op: 'program' });
  assert.deepEqual([v.isError, v.text.split('\n')[0], v.data.ok], [true, 'The PROM\'s program failed: verification did not complete', false]);
  delete process.env.FAKE_XCF_NOVERIFY;
  process.env.FAKE_ADEPT_NODONE = '1';
  assert.equal((await call('program_prom', { project: 'PromV', op: 'reconfigure' })).text.split('\n')[0],
    'The PROM\'s reconfigure failed: the FPGA did not load from the PROM (mode jumper on ROM? PROM bitstream with StartUpClk:Cclk?)');
  const bad = await call('program_prom', { project: 'PromV', op: 'format' });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /op/);
});

test('#4751 jtag_scan: the chain\'s devices, the project\'s board or the one given; nothing written', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'scan.log');
  await project('Scan', 'basys2');
  const s = await call('jtag_scan', { project: 'Scan', tool: 'adepttool' });
  assert.equal(s.isError, false, s.text);
  assert.equal(s.text.split('\n')[0], '2 device(s) in the JTAG chain: XC3S250E 0x11c1a093, XCF02S 0xf5045093.');
  assert.deepEqual(s.data.devices.map(d => [d.position, d.name]), [[0, 'XC3S250E'], [1, 'XCF02S']]);
  assert.deepEqual([s.data.board, s.data.tool], ['basys2', 'adepttool']);
  assert.match(await progLog(), /^python list\.py/m);
  const b = await call('jtag_scan', { board: 'basys2', tool: 'adepttool' });
  assert.equal(b.data.devices.length, 2);
  assert.match((await call('jtag_scan', { board: 'no-such-board' })).text, /^jtag_scan: unknown board 'no-such-board'$/);
  process.env.FAKE_ADEPT_FAIL = '1';
  const f = await call('jtag_scan', { board: 'basys2', tool: 'adepttool' });
  assert.deepEqual([f.isError, f.data.ok], [true, false]);
  assert.match(f.text.split('\n')[0], /^The scan failed: /);
});

test('#4751 bitstream_info: none yet, a Xilinx .bit\'s header (another device\'s warned), an iCE40\'s .bin by its size', async () => {
  await project('Bit', 'basys2');
  const none = await call('bitstream_info', { project: 'Bit' });
  assert.deepEqual([own(none.text), none.data.available, none.data.file], ['No bitstream yet (build/top.bit): run_process bitstream first.', false, 'build/top.bit']);
  await fs.mkdir(path.join(P.projectDir('Bit'), 'build'), { recursive: true });
  await fs.writeFile(path.join(P.projectDir('Bit'), 'build', 'top.bit'), makeBit({ design: 'top.ncd;UserID=0xFFFFFFFF', part: '3s250ecp132' }));
  const b = await call('bitstream_info', { project: 'Bit' });
  assert.equal(own(b.text), 'Bitstream build/top.bit: design top.ncd, part 3s250ecp132, built 2025/10/01 10:11:20.');
  assert.deepEqual([b.data.part, b.data.warning], ['3s250ecp132', null]);
  await fs.writeFile(path.join(P.projectDir('Bit'), 'build', 'top.bit'), makeBit({ part: '3s500efg320' }));
  const w = await call('bitstream_info', { project: 'Bit' });
  assert.match(own(w.text).split('\n')[1], /^WARNING: .*3s500e/i);
  await project('BitIce', 'icebreaker', { 'top.bin': Buffer.alloc(1234) }, ICE40);
  const i = await call('bitstream_info', { project: 'BitIce' });
  assert.deepEqual([own(i.text), i.data.size], ['Bitstream build/top.bin: 1234 bytes.', 1234]);
  await P.createProject({ name: 'BitNoTop', board: 'basys2' });
  assert.equal(own((await call('bitstream_info', { project: 'BitNoTop' })).text), 'No bitstream: no top module.');
});

test('#4751 toolchain_info: the mode, available and why, never a host, a user, a path or an image\'s account', async () => {
  const HOST = 'build-box.example.org', USER = 'someone';
  const settings = path.join(tmp, 'Xilinx', '14.7', 'ISE_DS', 'settings64.sh');
  await fs.mkdir(path.dirname(settings), { recursive: true });
  await fs.writeFile(settings, '#!/bin/sh\n');
  try {
    for (const cfg of [
      { mode: 'ssh', ssh: { host: HOST, user: USER, remoteDir: '/srv/silinx-build', settings: '/opt/Xilinx/14.7/ISE_DS/settings64.sh' } },
      { mode: 'docker', docker: { image: `${USER}/ise:14.7`, command: 'docker' } },
      { mode: 'local', local: { settings } },
      { mode: 'silinx' },
    ]) {
      await writeConfig({ paths: { adepttool: fakes.adept }, ...cfg });
      const r = await call('toolchain_info');
      assert.equal(r.isError, false, r.text);
      assert.equal(r.data.ise.mode, cfg.mode);
      assert.equal(typeof r.data.ise.available, 'boolean');
      assert.match(r.text, new RegExp(`^ISE: mode ${cfg.mode}, (not )?available: .+\\.\\nAMD Vivado: (not )?available`));
      const all = JSON.stringify(r);
      for (const secret of [HOST, USER, tmp, '/opt/Xilinx', '/srv/']) assert.ok(!all.includes(secret), `${cfg.mode}: ${secret} in ${all}`);
    }
    // (silinx: the Silinx toolchain, available)
    assert.equal((await call('toolchain_info')).data.ise.available, true);
  } finally { await writeConfig({ paths: { adepttool: fakes.adept } }); }
});
