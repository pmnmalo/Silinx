// Intel Quartus Prime as the Intel FPGAs' back end (#5378, server/quartus.js, server/quartus-reports.js): its steps, the
// device's Quartus name, the project's .qsf and .sdc, run.sh, the build folder made from a project on the DE0-CV, the reports'
// summaries parsed, its settings in Toolchain Settings (their checks), the dispatch of an Intel project to it (and the
// refusals); then the whole flow run with Quartus's tools faked (no Quartus here: scripts that write its summaries, the .sof),
// its reports.json, get_report and run_process (#2674).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratchEnv, writeConfig } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-quartus-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const Q = await import('../server/quartus.js');
const R = await import('../server/quartus-reports.js');
const tc = await import('../server/toolchain.js');
const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DE0CV = { family: 'cyclone5', part: '5ceba4', package: 'f23', speed: 'c7' };
const QSF = `set_location_assignment PIN_M9 -to clk
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk
set_location_assignment PIN_AA2 -to led[0]
# create_clock -name {clk} -period 20.000 [get_ports {clk}]
`;
const wait = async job => { while (job.status === 'running') await new Promise(r => setTimeout(r, 10)); return job; };
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}

// blinky as a project of the workspace on the DE0-CV's device, its constraints a QSF
function blinkyProject(name, { constraints = 'constraints/top.qsf', text = QSF, ...more } = {}) {
  const dir = path.join(process.env.SILINX_WORKSPACE, name);
  fs.cpSync(path.join(ROOT, 'examples', 'blinky'), dir, { recursive: true, filter: f => !/[\\/]build$/.test(f) });
  const project = { ...JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')), name, device: DE0CV, board: 'de0-cv', synthTool: 'quartus', constraints, ...more };
  fs.rmSync(path.join(dir, 'constraints'), { recursive: true, force: true });
  if (text !== null) { fs.mkdirSync(path.dirname(path.join(dir, constraints)), { recursive: true }); fs.writeFileSync(path.join(dir, constraints), text); }
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(project, null, 2));
  return { dir, project, trust: () => (more.trusted === false ? null : P.trustProject(name)) };
}

test('the Intel devices are Quartus\'s; their Quartus names and families; the steps of a request, ISE\'s names, the ones it has not', () => {
  assert.equal(Q.isQuartusDevice(DE0CV), true);
  assert.equal(Q.isQuartusDevice({ part: 'xc7a35t' }), false);
  assert.deepEqual(Q.quartusTarget(DE0CV), { device: '5CEBA4F23C7', family: 'Cyclone V' });
  assert.deepEqual(Q.quartusTarget({ part: '10m50da', package: 'f484', speed: 'c7g' }), { device: '10M50DAF484C7G', family: 'MAX 10' });
  assert.deepEqual(Q.quartusTarget({ part: 'ep4ce115', package: 'f29', speed: 'c7' }), { device: 'EP4CE115F29C7', family: 'Cyclone IV E' });
  assert.throws(() => Q.quartusTarget({ part: 'xc3s250e', package: 'cp132', speed: '-4' }), /^Error: not a device Quartus implements here: 'xc3s250e' \/ 'cp132' \/ '-4'$/);
  assert.throws(() => Q.quartusTarget({ part: '5ceba4', package: 'f23;rm', speed: 'c7' }), /not a device Quartus implements here/);
  assert.deepEqual(Q.quartusSteps([]), ['synth', 'par', 'trce', 'bitgen']);
  assert.deepEqual(Q.quartusSteps(['synth']), ['synth']);
  // (Translate and Map: the Fitter's, Place & Route; the timing whenever it runs)
  assert.deepEqual(Q.quartusSteps(['synth', 'translate', 'map']), ['synth', 'par', 'trce']);
  assert.deepEqual(Q.quartusSteps(['bitgen', 'prombit']), ['bitgen']);
  assert.throws(() => Q.quartusSteps(['synth', 'postsynth']), /^Error: Quartus's flow has no post-synthesis simulation model \(postsynth\)$/);
  assert.throws(() => Q.quartusSteps(['xpwr']), /Quartus's flow has no power analysis \(xpwr\)/);
});

test('<top>.qsf: the family, the device, the top, the unused pins tri-stated, the sources by language, the SDC, the project\'s pins', () => {
  const text = Q.quartusQsf({ top: 'top', device: '5CEBA4F23C7', family: 'Cyclone V', sdc: 'top.sdc', pins: 'set_location_assignment PIN_M9 -to clk\n',
    sources: [{ lang: 'vhdl', buildPath: 'src/top.vhd' }, { lang: 'verilog', buildPath: 'src/a.v' }, { lang: 'verilog', buildPath: 'src/b.sv' }] });
  assert.equal(text, `# Generated by Silinx - ${Q.QUARTUS_VERSION} project for 5CEBA4F23C7 (top: top).
set_global_assignment -name FAMILY "Cyclone V"
set_global_assignment -name DEVICE 5CEBA4F23C7
set_global_assignment -name TOP_LEVEL_ENTITY top
set_global_assignment -name PROJECT_OUTPUT_DIRECTORY output_files
set_global_assignment -name RESERVE_ALL_UNUSED_PINS_WEAK_PULLUP "AS INPUT TRI-STATED"
set_global_assignment -name VHDL_FILE "src/top.vhd"
set_global_assignment -name VERILOG_FILE "src/a.v"
set_global_assignment -name SYSTEMVERILOG_FILE "src/b.sv"
set_global_assignment -name SDC_FILE "top.sdc"

# The project's pins (its constraints file)
set_location_assignment PIN_M9 -to clk
`);
  assert.throws(() => Q.quartusQsf({ top: 'a b', device: 'X', family: 'Cyclone V', sources: [] }), /invalid top module name 'a b'/);
  assert.throws(() => Q.quartusQsf({ top: 't', device: 'X', family: 'Cyclone V', sources: [{ lang: 'vhdl', buildPath: 'src/a"b.vhd' }] }), /file path not allowed in Quartus's settings/);
});

test('run.sh: Quartus on PATH, QUARTUS_BIN or an install found (never a folder of the build folder); without it exit 127; the steps\' tools with their markers', { skip: process.platform === 'win32' }, () => {
  const sh = Q.quartusRunSh({ top: 'top', device: '5CEBA4F23C7' });
  assert.equal(spawnSync('bash', ['-n'], { input: sh }).status, 0);
  assert.match(sh, /    par\) step par quartus_fit --read_settings_files=on --write_settings_files=off top -c top ;;\n/);
  const dir = fs.mkdtempSync(path.join(tmp, 'runsh-'));
  fs.writeFileSync(path.join(dir, 'run.sh'), sh);
  const env = { PATH: '/usr/bin:/bin', HOME: dir };
  let r = spawnSync('bash', ['run.sh', 'synth'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(r.status, 127);
  assert.equal(r.stderr, 'ERROR: Intel Quartus Prime (quartus_sh) not found. Put its quartus/bin on PATH or set QUARTUS_BIN to it.\n');
  // a QUARTUS_BIN of the build folder: not used
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'quartus_sh'), '#!/bin/sh\n', { mode: 0o755 });
  r = spawnSync('bash', ['run.sh'], { cwd: dir, env: { ...env, QUARTUS_BIN: path.join(dir, 'bin') }, encoding: 'utf8' });
  assert.equal(r.status, 126);
  // a QUARTUS_BIN outside it: each step's tool run with the project, its marker; a tool that fails stops the flow with its code
  const inst = fs.mkdtempSync(path.join(tmp, 'quartus-'));
  for (const t of ['quartus_sh', 'quartus_map', 'quartus_fit']) fs.writeFileSync(path.join(inst, t), `#!/bin/sh\necho "${t} $*"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(inst, 'quartus_sta'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  r = spawnSync('bash', ['run.sh', 'synth', 'par', 'trce'], { cwd: dir, env: { ...env, QUARTUS_BIN: inst }, encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.equal(r.stdout, ['=== SILINX STEP synth ===', 'quartus_map --read_settings_files=on --write_settings_files=off top -c top', '=== SILINX STEP par ===',
    'quartus_fit --read_settings_files=on --write_settings_files=off top -c top', '=== SILINX STEP trce ===', '=== SILINX FAILED trce (exit 3) ===', ''].join('\n'));
});

test('the build folder of a DE0-CV project: its sources, <top>.qpf, <top>.qsf with its pins, <top>.sdc, run.sh; a UCF refused; no constraints: warned', async () => {
  const { dir } = blinkyProject('QBuild');
  const g = await Q.generateQuartusBuild(await P.readProject('QBuild'), dir);
  assert.deepEqual(g.files, ['top.qpf', 'top.qsf', 'top.sdc', 'run.sh']);
  assert.deepEqual(g.warnings, []);
  assert.deepEqual(g.target, { device: '5CEBA4F23C7', family: 'Cyclone V' });
  const b = path.join(dir, 'build');
  assert.equal(fs.readFileSync(path.join(b, 'top.qpf'), 'utf8'), `# Generated by Silinx - ${Q.QUARTUS_VERSION}\nPROJECT_REVISION = "top"\n`);
  const qsf = fs.readFileSync(path.join(b, 'top.qsf'), 'utf8');
  assert.match(qsf, /\nset_global_assignment -name VHDL_FILE "src\/src\/top\.vhd"\n/);
  assert.match(qsf, /\nset_global_assignment -name SDC_FILE "top\.sdc"\n\n# The project's pins \(its constraints file\)\nset_location_assignment PIN_M9 -to clk\nset_instance_assignment -name IO_STANDARD "3\.3-V LVTTL" -to clk\nset_location_assignment PIN_AA2 -to led\[0\]\n/);
  assert.equal(fs.readFileSync(path.join(b, 'top.sdc'), 'utf8'), "# SDC generated by Silinx for 'top' (5CEBA4F23C7)\n\ncreate_clock -name {clk} -period 20.000 -waveform {0.000 10.000} [get_ports {clk}]\nderive_pll_clocks\nderive_clock_uncertainty\n");
  assert.ok(!fs.existsSync(path.join(b, 'top.qsf.ucf')) && fs.existsSync(path.join(b, 'src', 'src', 'top.vhd')));
  // a UCF: refused; no constraints file: warned, no SDC
  blinkyProject('QUcf', { constraints: 'constraints/top.ucf', text: 'NET "clk" LOC = "P1";\n' });
  await assert.rejects(Q.generateQuartusBuild(await P.readProject('QUcf'), P.projectDir('QUcf')), /^Error: constraints\/top\.ucf is not a QSF: Quartus reads a QSF\. Update the constraints for the board \(Design Properties\) or write constraints\/top\.qsf\.$/);
  blinkyProject('QNone', { text: null });
  const n = await Q.generateQuartusBuild(await P.readProject('QNone'), P.projectDir('QNone'));
  assert.deepEqual(n.warnings, ['no constraints file (constraints/top.qsf): Quartus chooses the pins - do NOT program real hardware with this bitstream']);
  assert.deepEqual(n.files, ['top.qpf', 'top.qsf', 'run.sh']);
  // a QSF with no clock: warned (the Timing Analyzer has nothing to check)
  blinkyProject('QNoClock', { text: 'set_location_assignment PIN_M9 -to clk\n' });
  assert.deepEqual((await Q.generateQuartusBuild(await P.readProject('QNoClock'), P.projectDir('QNoClock'))).warnings, ['no clock in constraints/top.qsf (# create_clock): the Timing Analyzer has no constraint to check']);
  // a malformed QSF: its line
  blinkyProject('QBad', { text: 'set_location_assignment M9 -to clk\n' });
  await assert.rejects(Q.generateQuartusBuild(await P.readProject('QBad'), P.projectDir('QBad')), /^Error: constraints\/top\.qsf: line 1: set_location_assignment M9: a pin is PIN_<ball>/);
});

// Quartus's summaries as its tools write them (Quartus Prime Lite's text layout)
const MAP = 'Analysis & Synthesis Status : Successful - Wed Nov 26 01:00:00 2026\nQuartus Prime Version : 23.1std.1 Build 993\nRevision Name : top\nTop-level Entity Name : top\nFamily : Cyclone V\nLogic utilization (in ALMs) : N/A\nTotal registers : 92\nTotal pins : 27\nTotal virtual pins : 0\nTotal block memory bits : 0\nTotal DSP Blocks : 0\nTotal PLLs : 0\n';
const FIT = 'Fitter Status : Successful - Wed Nov 26 01:00:30 2026\nFamily : Cyclone V\nDevice : 5CEBA4F23C7\nTiming Models : Final\nLogic utilization (in ALMs) : 61 / 18,480 ( < 1 % )\nTotal registers : 92\nTotal pins : 27 / 224 ( 12 % )\nTotal virtual pins : 0\nTotal block memory bits : 0 / 3,153,920 ( 0 % )\nTotal RAM Blocks : 0 / 308 ( 0 % )\nTotal DSP Blocks : 0 / 66 ( 0 % )\nTotal PLLs : 0 / 4 ( 0 % )\n';
const FIT_C4 = 'Fitter Status : Successful - Wed Nov 26 01:00:30 2026\nFamily : Cyclone IV E\nDevice : EP4CE22F17C6\nTotal logic elements : 149 / 22,320 ( < 1 % )\n    Total combinational functions : 130 / 22,320 ( < 1 % )\n    Dedicated logic registers : 92 / 22,320 ( < 1 % )\nTotal registers : 92\nTotal pins : 27 / 154 ( 18 % )\nTotal memory bits : 0 / 608,256 ( 0 % )\nEmbedded Multiplier 9-bit elements : 0 / 132 ( 0 % )\nTotal PLLs : 0 / 4 ( 0 % )\n';
const STA = "------------------------------------------------------------\nTiming Analyzer Summary\n------------------------------------------------------------\n\nType  : Slow 1100mV 85C Model Setup 'clk'\nSlack : 15.512\nTNS   : 0.000\n\nType  : Slow 1100mV 0C Model Setup 'clk'\nSlack : 15.402\nTNS   : 0.000\n\nType  : Slow 1100mV 85C Model Hold 'clk'\nSlack : 0.341\nTNS   : 0.000\n\nType  : Fast 1100mV 0C Model Minimum Pulse Width 'clk'\nSlack : 8.990\nTNS   : 0.000\n";
const RPT = tool => `Info: *******************************************************************\nInfo: Quartus Prime ${tool} was successful. 0 errors, 2 warnings\n`;

test('the summaries: their utilization (an ALM, an LE a slice\'s place), the tools\' messages, the timing (each clock\'s worst slack, the SDC\'s period its Fmax)', () => {
  assert.deepEqual(R.summaryUtilization(FIT), [
    { name: 'Logic utilization (in ALMs)', used: 61, total: 18480, percent: 0.33, level: 0 }, { name: 'Total registers', used: 92, total: null, percent: null, level: 0 },
    { name: 'Total pins', used: 27, total: 224, percent: 12.05, level: 0 }, { name: 'Total block memory bits', used: 0, total: 3153920, percent: 0, level: 0 },
    { name: 'Total RAM Blocks', used: 0, total: 308, percent: 0, level: 0 }, { name: 'Total DSP Blocks', used: 0, total: 66, percent: 0, level: 0 },
    { name: 'Total PLLs', used: 0, total: 4, percent: 0, level: 0 }]);
  // (the synthesis's ALMs N/A: left out)
  assert.deepEqual(R.summaryUtilization(MAP).map(u => u.name), ['Total registers', 'Total pins', 'Total block memory bits', 'Total DSP Blocks', 'Total PLLs']);
  assert.deepEqual(R.utilizationSummary(R.summaryUtilization(FIT_C4)).slices, { used: 149, total: 22320, percent: 0.67 });
  assert.deepEqual(R.utilizationSummary(R.summaryUtilization(FIT_C4)).luts, { used: 130, total: 22320, percent: 0.58 });
  assert.deepEqual(R.toolMessages(`${RPT('Analysis & Synthesis')}Info: Quartus Prime Shell was successful. 0 errors, 0 warnings\n`), { ok: true, errors: 0, warnings: 0 });
  assert.deepEqual(R.toolMessages('Error: Quartus Prime Fitter was unsuccessful. 2 errors, 1 warning\n'), { ok: false, errors: 2, warnings: 1 });
  assert.equal(R.toolMessages('nothing'), null);
  assert.deepEqual(R.parseStaSummary(STA, [{ net: 'clk', period: 20 }]), { met: true, wnsNs: 15.402, whsNs: 0.341, noConstraints: false, minPeriodNs: 4.598, maxFreqMHz: 217.486,
    constraints: [{ name: 'clk', periodNs: 20, wnsNs: 15.402, whsNs: 0.341, minPeriodNs: 4.598, maxFreqMHz: 217.486 }] });
  assert.equal(R.parseStaSummary(STA.replace('15.402', '-0.200'), [{ net: 'clk', period: 20 }]).met, false);
  assert.deepEqual(R.parseStaSummary(''), { met: null, wnsNs: null, whsNs: null, constraints: [], minPeriodNs: null, maxFreqMHz: null, noConstraints: true });
});

test('Toolchain Settings: Quartus\'s mode, image and path, their checks (its path the file\'s only); its status in each mode', async () => {
  assert.deepEqual(tc.DEFAULT_CONFIG.quartus, { mode: 'local', image: '', path: '' });
  await writeConfig({ mode: 'silinx' });
  assert.deepEqual((await tc.loadConfig()).quartus, { mode: 'local', image: '', path: '' });
  await assert.rejects(tc.saveConfig({ quartus: { mode: 'silinx' } }), /^Error: invalid quartus\.mode 'silinx' \(local\|docker\|ssh\)$/);
  await assert.rejects(tc.saveConfig({ quartus: { image: '--privileged' } }), /quartus\.image contains invalid characters/);
  await assert.rejects(tc.saveConfig({ quartus: { path: 'relative/bin' } }), /quartus\.path must be an absolute path \(Quartus's quartus\/bin\)/);
  await assert.rejects(tc.saveConfig({ quartus: { path: '/opt/intelFPGA_lite/23.1std/quartus/bin' } }, { fromApi: true }), /^Error: quartus\.path can only be set in /);
  const saved = await tc.saveConfig({ quartus: { mode: 'docker', image: 'my/quartus:23.1' } }, { fromApi: true });
  assert.deepEqual(saved.quartus, { mode: 'docker', image: 'my/quartus:23.1', path: '' });
  const helpers = { bash: '/bin/bash', docker: '/usr/bin/docker', ssh: '/usr/bin/ssh', tar: '/usr/bin/tar' };
  const st = (quartus, more = {}) => Q.quartusStatus({ ...tc.DEFAULT_CONFIG, quartus: { ...tc.DEFAULT_CONFIG.quartus, ...quartus }, ...more }, { quartus: { found: false }, helpers });
  assert.match(st({}).reason, /^Intel Quartus Prime not found \(looked for quartus_sh on PATH and under \/opt\/intelFPGA_lite\/\*\/quartus\/bin/);
  assert.equal(Q.quartusStatus({ quartus: { mode: 'local' } }, { quartus: { found: true, path: '/q/bin' }, helpers }).reason, 'Quartus found in /q/bin');
  assert.equal(st({ mode: 'docker' }).reason, 'no Quartus docker image configured (quartus.image)');
  assert.equal(st({ mode: 'docker', image: 'q:1' }).available, true);
  assert.equal(st({ mode: 'ssh' }).reason, 'no ssh host configured (ssh.host)');
  assert.deepEqual(st({ mode: 'ssh', image: 'q:1' }, { ssh: { host: 'h' } }), { mode: 'ssh', available: true, reason: 'the ssh host (docker image q:1)', help: Q.QUARTUS_HELP.ssh });
  const det = await tc.detectToolchain();
  assert.equal(det.quartus.mode, 'docker');
  assert.equal(det.quartus.version, Q.QUARTUS_VERSION);
});

test('an Intel project is implemented by Quartus (POST implement, run_process): its job, its refusals; Quartus not found: the job\'s error and its help', async () => {
  const { startImplementation } = await import('../server/impl-routes.js');
  await writeConfig({ mode: 'silinx', quartus: { mode: 'docker' } });
  await blinkyProject('QBlinky').trust();   // (#4735: written by hand, the user trusts it)
  const job = await wait(await startImplementation('QBlinky', { steps: ['synth'] }));
  assert.equal(job.meta.toolchain, 'quartus');
  assert.equal(job.status, 'error');
  const reason = 'no Quartus docker image configured (quartus.image)';
  assert.equal(job.error, `Intel Quartus Prime not available (docker mode): ${reason}. Configure it in Toolchain Settings (quartus in ~/.silinx/config.json, PUT /api/toolchain), or run ${path.join(P.projectDir('QBlinky'), 'build', 'run.sh')} on a machine with Quartus.`);
  assert.deepEqual(job.lines.filter(l => /^(How to fix|Quartus is not)/.test(l)), [`Quartus is not available in mode 'docker': ${reason}`, `How to fix: ${Q.QUARTUS_HELP.docker}`]);
  const gen = await wait(await startImplementation('QBlinky', { generateOnly: true }));
  assert.equal(gen.status, 'ok');
  assert.ok(gen.lines.includes('Scripts generated only (generateOnly). Run build/run.sh on a machine with Quartus.'));
  assert.ok(fs.existsSync(path.join(P.projectDir('QBlinky'), 'build', 'top.qpf')));
  // another toolchain asked for; Quartus asked for a Spartan-3E; a simulation model; an untrusted project
  for (const toolchain of ['ise', 'vivado']) await assert.rejects(startImplementation('QBlinky', { toolchain }), new RegExp(`^Error: Intel Quartus Prime implements the 5CEBA4 \\(Cyclone V\\), not ${toolchain} \\(toolchain: 'quartus'\\)$`));
  // (#5377: the DE0-CV's 5CEBA4 is a part of nextpnr-mistral's: the Silinx toolchain asked for implements it)
  const open = await wait(await startImplementation('QBlinky', { toolchain: 'silinx', steps: ['synth'] }));
  assert.deepEqual([open.meta.toolchain, open.status], ['silinx', 'ok'], open.error);
  fs.cpSync(path.join(ROOT, 'examples', 'gates'), path.join(process.env.SILINX_WORKSPACE, 'QGates'), { recursive: true });
  await assert.rejects(startImplementation('QGates', { toolchain: 'quartus' }), /^Error: Intel Quartus Prime implements the Intel FPGAs \(the MAX 10, the Cyclone IV E, the Cyclone V\), not the XC3S250E$/);
  await assert.rejects(startImplementation('QBlinky', { steps: ['postsynth'] }), /Quartus's flow has no post-synthesis simulation model/);
  blinkyProject('QOutside', { trusted: false });
  await assert.rejects(startImplementation('QOutside', {}), /^Error: project 'QOutside' came from outside \(imported\): Intel Quartus Prime runs only once you trust it/);
  const r = await call('run_process', { project: 'QBlinky', process: 'synthesize', log_lines: 2 });
  assert.equal(r.isError, true);
  assert.equal(r.data.toolchain, 'quartus');
  assert.match(r.text, /Process "synthesize" of <top> failed \(1 error\(s\), 0 warning\(s\)\) \(Intel Quartus Prime\)\.$/);
});

test('the whole flow with Quartus\'s tools faked: the steps\' markers, reports.json (utilization, timing, the .sof made a .rbf), get_report, the Design Summary\'s rows', { skip: process.platform === 'win32' }, async () => {
  const { startImplementation, projectReports } = await import('../server/impl-routes.js');
  const bin = fs.mkdtempSync(path.join(tmp, 'fake-quartus-'));
  const out = (ext, text) => `mkdir -p output_files; printf '%s' '${text.replace(/'/g, "'\\''")}' > output_files/top.${ext}`;
  const tools = {
    quartus_sh: 'exit 0',
    quartus_map: [out('map.summary', MAP), out('map.rpt', RPT('Analysis & Synthesis')), 'echo "Warning (10230): Verilog HDL assignment warning at top.v(3): truncated value"'].join('\n'),
    quartus_fit: [out('fit.summary', FIT), out('fit.rpt', RPT('Fitter'))].join('\n'),
    quartus_sta: [out('sta.summary', STA), out('sta.rpt', RPT('Timing Analyzer'))].join('\n'),
    quartus_asm: [out('asm.rpt', RPT('Assembler')), "printf 'SOF' > output_files/top.sof"].join('\n'),
    // (#5379: the .sof made the DE0-CV's .rbf, its arguments kept)
    quartus_cpf: 'echo "$@" > cpf.args; printf \'RBF!\' > top.rbf',
  };
  for (const [t, body] of Object.entries(tools)) fs.writeFileSync(path.join(bin, t), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  // (quartus.path: the file's, written as the user does)
  await writeConfig({ mode: 'silinx', quartus: { mode: 'local', image: '', path: bin } });
  await blinkyProject('QFlow').trust();
  const job = await wait(await startImplementation('QFlow', {}));
  assert.equal(job.status, 'ok', job.error);
  assert.deepEqual(job.result.completedSteps, ['synth', 'par', 'trce', 'bitgen']);
  assert.ok(job.lines.includes('Warning (10230): Verilog HDL assignment warning at top.v(3): truncated value'));
  assert.ok(job.lines.includes('Programming file: build/top.rbf'));
  assert.equal(fs.readFileSync(path.join(P.projectDir('QFlow'), 'build', 'cpf.args'), 'utf8'), '-c output_files/top.sof top.rbf\n');
  const rep = await projectReports('QFlow');
  assert.equal(rep.source, 'quartus');
  assert.deepEqual(rep.summary, { synthesized: true, mapped: true, routed: true, timingMet: true, maxFreqMHz: 217.486, drc: null, bitstream: true,
    utilization: { slices: { used: 61, total: 18480, percent: 0.33 }, luts: { used: 61, total: 18480, percent: 0.33 }, ffs: { used: 92, total: null, percent: null }, iobs: { used: 27, total: 224, percent: 12.05 },
      bram: { used: 0, total: 308, percent: 0 }, dsp: { used: 0, total: 66, percent: 0 }, pll: { used: 0, total: 4, percent: 0 } } });
  assert.deepEqual(rep.messages, { errors: 0, criticalWarnings: 0, warnings: 8 });
  assert.deepEqual(rep.bit, { path: 'build/top.rbf', size: 4, sof: 'build/output_files/top.sof' });
  // the MCP's get_report: the summary with the Design Summary's rows, the Fitter's report by its file
  const sum = await call('get_report', { project: 'QFlow' });
  assert.equal(sum.data.summary.source, 'quartus');
  assert.deepEqual(sum.data.summary.designSummary.utilization.rows.map(r => r.name).slice(0, 3), ['Logic utilization (in ALMs)', 'Total pins', 'Total block memory bits']);
  const fit = await call('get_report', { project: 'QFlow', report: 'map' });
  assert.equal(fit.data.toolchain, 'quartus');
  assert.equal(fit.data.path, 'build/output_files/top.fit.rpt');
  assert.match(fit.text, /Quartus Prime Fitter was successful\. 0 errors, 2 warnings/);
});
