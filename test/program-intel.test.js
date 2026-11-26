// Programming the Intel (Altera) boards (#5379): Quartus's .sof made the file openFPGALoader loads into the FPGA's SRAM (a .rbf
// for the Cyclone IV and V, an .svf for the MAX 10, whose SRAM is loaded only as an SVF), and openFPGALoader run through the
// board's USB-Blaster (-c usb-blaster) or USB-Blaster II (-c usb-blasterII, its firmware a local Quartus's blaster_6810.hex),
// with -b where openFPGALoader names the board; through the MCP server's program_board (the interface's function) with a fake
// openFPGALoader (test/server-helpers.js makeFakes), never a real board; the file's family checked against the device's.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, makeFakes, isolatedPath, writeConfig, waitJob, POSIX_ONLY } from './server-helpers.js';

let tmp, fakes, oldPath, P, handle, prog, jobs;
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const BOARDS = { 'de0-cv': ['cyclone5', '5ceba4', 'f23', 'c7'], 'de10-lite': ['max10', '10m50da', 'f484', 'c7g'], 'de1-soc': ['cyclone5', '5csema5', 'f31', 'c6'],
  'de0-nano': ['cyclone4e', 'ep4ce22', 'f17', 'c6'], 'de2-115': ['cyclone4e', 'ep4ce115', 'f29', 'c7'], 'de10-nano': ['cyclone5', '5cseba6', 'u23', 'i7'] };
async function project(name, board, file) {
  const [family, part, pkg, speed] = BOARDS[board];
  await P.createProject({ name, board, device: { family, part, package: pkg, speed } });
  await P.updateProject(name, pj => { pj.top = 'top'; });
  const f = path.join(P.projectDir(name), 'build', file);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, 'BITS');
  return { file: f, shown: `<workspace>/${name}/build/${file}` };   // (as the MCP server names the workspace's paths, #3418)
}
const progLog = () => fs.readFile(process.env.FAKE_PROG_LOG, 'utf8');

before(async () => {
  tmp = await scratchEnv('silinx-program-intel-');
  fakes = await makeFakes(tmp);
  oldPath = process.env.PATH;
  process.env.PATH = isolatedPath(fakes.prog);
  await writeConfig({});
  ({ handle } = await import('../server/mcp.js'));
  P = await import('../server/projects.js');
  prog = await import('../server/programmer.js');
  jobs = await import('../server/jobs.js');
});
afterEach(async () => { delete process.env.FAKE_PROG_LOG; await writeConfig({}); });
after(async () => { process.env.PATH = oldPath; await fs.rm(tmp, { recursive: true, force: true }); });

test('the Intel boards\' programmers: openFPGALoader, the cable of their USB-Blaster, -b where openFPGALoader names the board; the file by the family', async () => {
  const { INTEL_BOARDS } = await import('../core/boards-intel.js');
  const { bitstreamExtOf } = await import('../packages/silinx-fpga/src/parts.js');
  assert.deepEqual(INTEL_BOARDS.map(b => [b.id, b.programmer.preferred, b.programmer.tools.openFPGALoader.board ?? null, b.programmer.tools.openFPGALoader.cable, bitstreamExtOf(b.device)]), [
    ['de10-lite', 'openFPGALoader', 'de10lite', 'usb-blaster', '.svf'], ['de0-cv', 'openFPGALoader', null, 'usb-blaster', '.rbf'],
    ['de1-soc', 'openFPGALoader', 'de1Soc', 'usb-blasterII', '.rbf'], ['de10-nano', 'openFPGALoader', 'de10nano', 'usb-blasterII', '.rbf'],
    ['de0-nano', 'openFPGALoader', 'de0nano', 'usb-blaster', '.rbf'], ['de2-115', 'openFPGALoader', null, 'usb-blaster', '.rbf']]);
  for (const b of INTEL_BOARDS) {
    const t = b.programmer.tools.openFPGALoader;
    assert.deepEqual([t.onboard, t.verified], [true, false], b.id);
    assert.equal(t.note, `The on-board ${t.usb} (JTAG): the ${bitstreamExtOf(b.device)} loaded into the FPGA's SRAM, until the board is powered off.`, b.id);
  }
  // Quartus's run.sh: the Assembler's .sof, then quartus_cpf's file of it; the process tree's Program FPGA, its file
  const Q = await import('../server/quartus.js');
  assert.match(Q.quartusRunSh({ top: 'top', device: '10M50DAF484C7G', ext: '.svf' }), /\nassemble\(\) \{ quartus_asm --read_settings_files=on --write_settings_files=off top -c top && quartus_cpf -c -q 12\.0MHz -g 3\.3 -n p output_files\/top\.sof top\.svf; \}\n/);
  assert.match(Q.quartusRunSh({ top: 'top', device: '5CEBA4F23C7', ext: '.rbf' }), /&& quartus_cpf -c output_files\/top\.sof top\.rbf; \}\n[^]*\n {4}bitgen\) step bitgen assemble ;;\n/);
  const { toolOf } = await import('../core/tool-descriptors.js');
  for (const [b, file] of [['de10-lite', '{top}.svf'], ['de0-cv', '{top}.rbf'], ['de2-115', '{top}.rbf']]) {
    const [family, part] = BOARDS[b], t = toolOf({ family, part }, false);
    assert.deepEqual(t.program, { process: 'config', page: 'program-open', title: 'Program FPGA', target: 'sram', file }, b);
    assert.deepEqual(t.steps.find(s => s.id === 'bitgen').produces, ['output_files/{top}.sof', file], b);
    assert.equal(toolOf({ family, part }, false, { standalone: true }).program, null, b);   // (the browser edition: no Quartus)
  }
});

test('program_board: the DE0-CV\'s .rbf with -c usb-blaster, the DE10-Lite\'s .svf with -b de10lite; their bitstream_info', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'intel.log');
  const { file: rbfFile, shown: rbf } = await project('Cv', 'de0-cv', 'top.rbf');
  const info = await call('bitstream_info', { project: 'Cv' });
  assert.deepEqual([info.text.split('\n')[0], info.data.available, info.data.file, info.data.size], ['Bitstream build/top.rbf: 4 bytes.', true, 'build/top.rbf', 4]);
  let r = await call('program_board', { project: 'Cv' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.text.split('\n')[0], 'Programmed the board (de0-cv) with build/top.rbf.');
  assert.deepEqual([r.data.tool, r.data.target, r.data.warnings], ['openFPGALoader', 'jtag', []]);
  assert.deepEqual(r.data.commands, [{ cmd: 'openFPGALoader', args: ['-c', 'usb-blaster', rbf], code: 0 }]);
  for (const l of [`Configuration file ${rbf} (4 bytes, an Intel FPGA's .rbf)`, 'NOTE: The on-board USB-Blaster (JTAG): the .rbf loaded into the FPGA\'s SRAM, until the board is powered off.',
    'NOTE: the openFPGALoader defaults for this board are not verified on real hardware.', 'Programming (SRAM, volatile) with openFPGALoader cable=usb-blaster', 'Programming finished.'])
    assert.ok(r.data.log.includes(l), `${l}\n${r.data.log.join('\n')}`);
  assert.deepEqual(r.data.log.filter(l => /WARNING|ERROR/.test(l)), []);
  const { file: svfFile, shown: svf } = await project('Lite', 'de10-lite', 'top.svf');
  r = await call('program_board', { project: 'Lite' });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(r.data.commands, [{ cmd: 'openFPGALoader', args: ['-b', 'de10lite', '-c', 'usb-blaster', svf], code: 0 }]);
  assert.ok(r.data.log.includes('Programming (SRAM, volatile) with openFPGALoader board=de10lite cable=usb-blaster'), r.data.log.join('\n'));
  assert.deepEqual((await progLog()).trim().split('\n'), [`openFPGALoader -c usb-blaster ${rbfFile}`, `openFPGALoader -b de10lite -c usb-blaster ${svfFile}`]);
  // no file yet: said, nothing run
  await fs.rm(svfFile);
  const none = await call('bitstream_info', { project: 'Lite' });
  assert.deepEqual([none.text.split('\n')[0], none.data.available], ['No bitstream yet (build/top.svf): run_process bitstream first.', false]);
  r = await call('program_board', { project: 'Lite' });
  assert.equal(r.isError, true);
  assert.equal(r.text, 'program_board: bitstream not found: <workspace>/Lite/build/top.svf (run the implementation first)');
});

test('program_board on a USB-Blaster II: the firmware of a local Quartus given (--probe-firmware), else said', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'blaster2.log');
  const { shown: rbf, file: rbfFile } = await project('Soc', 'de1-soc', 'top.rbf');
  let r = await call('program_board', { project: 'Soc' });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(r.data.commands[0].args, ['-b', 'de1Soc', '-c', 'usb-blasterII', rbf]);
  assert.ok(r.data.log.includes('NOTE: the USB-Blaster II\'s firmware (Quartus\'s blaster_6810.hex) was not found with a local Quartus: openFPGALoader loads it only if it was built with its folder (BLASTERII_PATH), or once Quartus\'s driver has.'), r.data.log.join('\n'));
  // a Quartus installation (quartus.path, its quartus/bin; the firmware in quartus/linux64)
  const root = path.join(tmp, 'intelFPGA_lite', '23.1std', 'quartus');
  await fs.mkdir(path.join(root, 'bin'), { recursive: true });
  await fs.mkdir(path.join(root, 'linux64'), { recursive: true });
  await fs.writeFile(path.join(root, 'bin', 'quartus_sh'), '#!/bin/sh\n', { mode: 0o755 });
  await fs.writeFile(path.join(root, 'linux64', 'blaster_6810.hex'), ':00000001FF\n');
  await writeConfig({ quartus: { mode: 'local', image: '', path: path.join(root, 'bin') } });
  r = await call('program_board', { project: 'Soc' });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(r.data.commands[0].args, ['-b', 'de1Soc', '-c', 'usb-blasterII', '--probe-firmware', path.join(root, 'linux64', 'blaster_6810.hex'), rbf]);
  assert.ok(!r.data.log.some(l => /blaster_6810\.hex\) was not found/.test(l)));
});

test('an Intel FPGA\'s file for another device warned; a .rbf by an absolute path refused; openFPGALoader\'s failure', { skip: POSIX_ONLY }, async () => {
  const { file: rbf } = await project('Nano', 'de0-nano', 'top.rbf');
  assert.equal(prog.openFamilyOf(rbf, null), 'intel');
  assert.equal(prog.openFamilyOf('/x/top.SVF', null), 'intel');
  assert.deepEqual(prog.buildCommands('program', { tool: 'openFPGALoader', cable: 'usb-blaster', bitfile: rbf, target: 'jtag' }), [{ cmd: 'openFPGALoader', args: ['-c', 'usb-blaster', rbf] }]);
  const j = jobs.createJob('program', jj => prog.programJob(jj, { board: 'de0-nano', bitfile: rbf, expectDevice: { part: 'xc3s250e', package: 'cp132' } }));
  const done = await waitJob(jobs, j.id);
  assert.equal(done.status, 'ok', done.error);
  assert.deepEqual(done.result.warnings, ["a .rbf is an Intel FPGA's configuration, but the target device is 'xc3s250e'"]);
  const own = jobs.createJob('program', jj => prog.programJob(jj, { board: 'de2-115', bitfile: rbf, expectDevice: { part: 'ep4ce115', package: 'f29' } }));
  assert.deepEqual((await waitJob(jobs, own.id)).result.warnings, []);
  // (a .rbf by an absolute path: only a project's, as a .bin's)
  assert.equal((await call('program_board', { project: 'Nano', bitfile: rbf })).isError, true);
  const { startProgramming } = await import('../server/impl-routes.js');
  await assert.rejects(startProgramming({ bitfile: rbf }), e => e.status === 400 && /only \.bit files, or a project's \.bin \(the iCE40\), \.fs \(the Gowin\) or \.svf or \.rbf \(an Intel FPGA\), can be programmed/.test(e.message));
  process.env.FAKE_PROG_FAIL = 'openFPGALoader';
  const r = await call('program_board', { project: 'Nano' });
  delete process.env.FAKE_PROG_FAIL;
  assert.equal(r.isError, true);
  assert.equal(r.text.split('\n')[0], 'Programming failed: openFPGALoader exited with code 1');
});
