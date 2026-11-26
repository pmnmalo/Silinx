// Intel Quartus Prime (Lite Edition) as the back end of the Intel FPGAs' boards (#5378, the Intel roadmap's phase 3): the MAX 10,
// the Cyclone IV E and the Cyclone V of Terasic's DE boards (#5376), as AMD Vivado is the 7-series' (server/vivado.js) and
// Xilinx ISE the Spartan-3E's (server/ise.js). Silinx writes the Quartus project and runs Quartus's command-line tools.
//
// generateQuartusBuild() writes <project>/build/:
//   src/...      the design's sources (ise.js generateBuild's copies: the folder is self-contained for docker / ssh)
//   <top>.qpf    the project
//   <top>.qsf    its settings: the family, the device, the top, the sources, the SDC, the unused pins tri-stated with their
//                weak pull-up (as Terasic's golden tops), then the project's own pins (its QSF, qsf.js)
//   <top>.sdc    the clocks of the project's QSF (qsf.js writeSdc), the PLLs' derived
//   run.sh       Quartus's tools of the steps asked, each with its marker
// ISE's step names are kept (the Processes pane's and the MCP server's processes, #2674), each Quartus's tool:
//   synth -> quartus_map (Analysis & Synthesis)    par -> quartus_fit (the Fitter: its placement and routing)
//   trce -> quartus_sta (the Timing Analyzer)      bitgen -> quartus_asm (the Assembler: output_files/<top>.sof)
// The reports are output_files/<top>.{map,fit,sta}.summary and the tools' .rpt (server/quartus-reports.js), parsed into
// build/reports.json. runQuartus() runs run.sh in Toolchain Settings' Quartus mode (quartus.mode: local, docker or ssh, as
// ISE's and Vivado's modes; quartus.path: the folder of quartus_sh, '' when it is on PATH or found; quartus.image: the docker
// image) inside a job. None of Quartus's files is part of Silinx (CLAUDE.md), nor is Quartus installed by it.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FAMILY_INFO, deviceFamily, deviceLabel, quartusDevice, readQsf, writeQsf, writeSdc } from '../packages/silinx-fpga/src/parts.js';
import { generateBuild, runDocker, runSsh } from './ise.js';
import { loadConfig, which } from './toolchain.js';
import { runCommand } from './jobs.js';
import { IDENT } from './ident.js';
import { hiddenIn, within } from './paths.js';
import { collectQuartusReports } from './quartus-reports.js';

export const QUARTUS_VERSION = 'Quartus Prime Lite 23.1';
/** Is a device's family one Quartus implements (FAMILY_INFO's backEnd 'quartus')? */
export const isQuartusDevice = quartusDevice;

// the steps Quartus runs (ISE's names), in order; the default flow (an empty request) and the ones it does not have
const QUARTUS_STEPS = ['synth', 'par', 'trce', 'bitgen'];
const TOOL = { synth: 'quartus_map', par: 'quartus_fit', trce: 'quartus_sta', bitgen: 'quartus_asm' };
const NOT_IN_QUARTUS = { postsynth: 'post-synthesis simulation model', posttrans: 'post-translate simulation model',
  postmap: 'post-map simulation model', postpar: 'post-place & route simulation model', fpgaview: 'FPGA view', xpwr: 'power analysis', pin2ucf: 'pin report' };
/** The folders run.sh looks for quartus_sh in when it is not on PATH and QUARTUS_BIN is not set (Intel's installers'). */
const QUARTUS_GLOBS = ['/opt/intelFPGA_lite/*/quartus/bin', '/opt/intelFPGA/*/quartus/bin', '/opt/altera/*/quartus/bin', '$HOME/intelFPGA_lite/*/quartus/bin', '$HOME/intelFPGA/*/quartus/bin'];

// (translate and map: the Fitter's, par; prombit: the Assembler's .sof, the flash's file is the programming's, #5379)
const AS_STEP = { translate: 'par', map: 'par', prombit: 'bitgen' };
/** The steps of a request in Quartus's order (AS_STEP's as their step); a step it has not: an error. */
export function quartusSteps(steps) {
  const list = !steps || !steps.length ? QUARTUS_STEPS : steps.map(s => AS_STEP[s] || s);
  for (const s of list) if (NOT_IN_QUARTUS[s]) throw Object.assign(new Error(`Quartus's flow has no ${NOT_IN_QUARTUS[s]} (${s})`), { status: 400 });
  const set = new Set(list);
  if (set.has('par')) set.add('trce');   // the timing whenever the Fitter runs, as ISE's
  return QUARTUS_STEPS.filter(s => set.has(s));
}

/** Quartus's device name (5CEBA4F23C7) and family ("Cyclone V") of a project device; an error for one it does not implement. */
export function quartusTarget(device) {
  const fam = deviceFamily(device), info = FAMILY_INFO[fam];
  const name = info?.backEnd === 'quartus' ? deviceLabel(device) : '';
  if (!/^[0-9A-Z]+$/.test(name)) throw Object.assign(new Error(`not a device Quartus implements here: '${device?.part}' / '${device?.package}' / '${device?.speed}'`), { status: 400 });
  return { device: name, family: info.name };
}

// a value of a QSF's assignment in quotes (a path, a family's name): none of the characters that would end it
const qsfValue = v => { if (/["\\\r\n$[\]{}]/.test(v)) throw Object.assign(new Error(`file path not allowed in Quartus's settings: ${JSON.stringify(v)}`), { status: 400 }); return `"${v}"`; };

/** <top>.qsf: the project's settings, its sources, its SDC, then the pins of the project's QSF (pins: its text, '' none). */
export function quartusQsf({ top, device, family, sources, sdc = null, pins = '' }) {
  if (!IDENT.test(top)) throw Object.assign(new Error(`invalid top module name '${top}'`), { status: 400 });
  const kind = s => (s.lang === 'vhdl' ? 'VHDL_FILE' : /\.sv$/i.test(s.buildPath) ? 'SYSTEMVERILOG_FILE' : 'VERILOG_FILE');
  return [`# Generated by Silinx - ${QUARTUS_VERSION} project for ${device} (top: ${top}).`,
    `set_global_assignment -name FAMILY ${qsfValue(family)}`,
    `set_global_assignment -name DEVICE ${device}`,
    `set_global_assignment -name TOP_LEVEL_ENTITY ${top}`,
    'set_global_assignment -name PROJECT_OUTPUT_DIRECTORY output_files',
    // (the pins no port is on: inputs, tri-stated, with their weak pull-up, as Terasic's golden tops; Quartus drives them low otherwise)
    'set_global_assignment -name RESERVE_ALL_UNUSED_PINS_WEAK_PULLUP "AS INPUT TRI-STATED"',
    ...sources.map(s => `set_global_assignment -name ${kind(s)} ${qsfValue(s.buildPath)}`),
    ...(sdc ? [`set_global_assignment -name SDC_FILE ${qsfValue(sdc)}`] : []),
    ...(pins ? ['', '# The project\'s pins (its constraints file)', pins.trimEnd()] : []), ''].join('\n');
}

/** run.sh: Quartus's tools on PATH, else QUARTUS_BIN's, else the first install found; the steps' tools, each with its marker. */
export function quartusRunSh({ top, device }) {
  const run = s => `    ${s}) step ${s} ${TOOL[s]} --read_settings_files=on --write_settings_files=off ${top} -c ${top} ;;`;
  return `#!/usr/bin/env bash
# Generated by Silinx - ${QUARTUS_VERSION} flow for ${device} (top: ${top}).
# Usage: ./run.sh [${QUARTUS_STEPS.join(' ')}]   (no arguments = ${QUARTUS_STEPS.join(' ')})
# Environment: QUARTUS_BIN=/path/to/quartus/bin (used when quartus_sh is not on PATH)
cd "$(dirname "$0")" || exit 1
STEPS=("$@")
[ \${#STEPS[@]} -gt 0 ] || STEPS=(${QUARTUS_STEPS.join(' ')})
if ! command -v quartus_sh >/dev/null 2>&1; then
  B="\${QUARTUS_BIN:-$(ls -d ${QUARTUS_GLOBS.join(' ')} 2>/dev/null | sort -r | head -1)}"
  if [ -n "$B" ] && [ -x "$B/quartus_sh" ]; then
    # never a folder of the build folder (its files come from the project)
    here="$(pwd -P)"; real="$(cd -P "$B" 2>/dev/null && pwd -P)"
    case "$real/" in "$here"/*) echo "ERROR: QUARTUS_BIN ($B) is a folder of the build folder: not used." >&2; exit 126 ;; esac
    export PATH="$real:$PATH"
  fi
fi
if ! command -v quartus_sh >/dev/null 2>&1; then
  echo "ERROR: Intel Quartus Prime (quartus_sh) not found. Put its quartus/bin on PATH or set QUARTUS_BIN to it." >&2
  exit 127
fi
step() {
  local name="$1"; shift
  echo "=== SILINX STEP $name ==="
  "$@" || { code=$?; echo "=== SILINX FAILED $name (exit $code) ==="; exit $code; }
}
for s in "\${STEPS[@]}"; do
  case "$s" in
${QUARTUS_STEPS.map(run).join('\n')}
    *) echo "ERROR: unknown step $s" >&2; exit 2 ;;
  esac
done
echo "=== SILINX DONE ==="
`;
}

/** The build folder for Quartus: the sources (ise.js), <top>.qpf, <top>.qsf, <top>.sdc, run.sh. */
export async function generateQuartusBuild(project, projectDir) {
  const target = quartusTarget(project.device);
  const gen = await generateBuild(project, projectDir, { sourcesOnly: true });
  const { buildDir, top } = gen;
  const warnings = [...gen.warnings];
  // (the project's file, as the build's sources: inside its folder, also through its links, and no hidden one, #3036)
  const cons = project.constraints && path.resolve(projectDir, project.constraints);
  if (cons && (!within(projectDir, cons) || hiddenIn(projectDir, cons))) throw Object.assign(new Error(`the constraints file ${project.constraints} is not one of the project's files (outside its folder, or a hidden one)`), { status: 400 });
  let model = null;
  if (cons && /\.qsf$/i.test(cons) && fss.existsSync(cons)) {
    try { model = readQsf(await fs.readFile(cons, 'utf8')); } catch (e) { throw Object.assign(new Error(`${project.constraints}: ${e.message}`), { status: 400 }); }
  } else if (cons && fss.existsSync(cons)) throw Object.assign(new Error(`${project.constraints} is not a QSF: Quartus reads a QSF. Update the constraints for the board (Design Properties) or write ${project.constraints.replace(/\.\w+$/, '.qsf')}.`), { status: 400 });
  else warnings.push(`no constraints file (${project.constraints || 'project.constraints not set'}): Quartus chooses the pins - do NOT program real hardware with this bitstream`);
  if (gen.constraintsFile) await fs.rm(path.join(buildDir, gen.constraintsFile), { force: true });
  const sdcText = model ? writeSdc(model, { header: `SDC generated by Silinx for '${top}' (${target.device})` }) : '';
  if (model && !sdcText) warnings.push(`no clock in ${project.constraints} (# create_clock): the Timing Analyzer has no constraint to check`);
  const files = {
    [`${top}.qpf`]: `# Generated by Silinx - ${QUARTUS_VERSION}\nPROJECT_REVISION = "${top}"\n`,
    [`${top}.qsf`]: quartusQsf({ top, ...target, sources: gen.sources, sdc: sdcText ? `${top}.sdc` : null, pins: model ? writeQsf(model).text : '' }),
    ...(sdcText ? { [`${top}.sdc`]: sdcText } : {}),
    'run.sh': quartusRunSh({ top, device: target.device }),
  };
  if (!sdcText) await fs.rm(path.join(buildDir, `${top}.sdc`), { force: true });
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(buildDir, name), text);
  await fs.chmod(path.join(buildDir, 'run.sh'), 0o755);
  return { buildDir, top, device: project.device, target, sources: gen.sources, clocks: model?.clocks || [], files: Object.keys(files), warnings };
}

// ---------------------------------------------------------------------------------------------
// The modes (Toolchain Settings' quartus: { mode, image, path }; ISE's docker and ssh settings for the rest)
// ---------------------------------------------------------------------------------------------

/** The configuration ISE's runners take, made from Quartus's: its image, its tools' folder in the environment. */
function quartusRunConfig(cfg) {
  const q = cfg.quartus || {};
  const env = q.path ? ['-e', `QUARTUS_BIN=${q.path}`] : [];
  return {
    ...cfg,
    mode: q.mode || 'local',
    local: { ...cfg.local, settings: '' },
    docker: { ...cfg.docker, image: q.image || '', settings: '', extraArgs: [...env, ...(cfg.docker?.extraArgs || [])] },
    ssh: { ...cfg.ssh, image: q.image || '', settings: '' },
  };
}

/** A local Quartus: quartus_sh on PATH, or in quartus.path, else in one of QUARTUS_GLOBS' folders. */
function detectQuartus(cfg, { home = os.homedir() } = {}) {
  const bin = which('quartus_sh');
  if (bin) return { found: true, path: path.dirname(bin) };
  const cands = cfg?.quartus?.path ? [cfg.quartus.path] : [];
  for (const g of QUARTUS_GLOBS.map(x => x.replace('$HOME', home))) {
    const [root, rest] = g.split('/*/');
    try { for (const d of fss.readdirSync(root).sort().reverse()) cands.push(path.join(root, d, rest)); } catch { /* none */ }
  }
  const dir = cands.find(d => fss.existsSync(path.join(d, 'quartus_sh'))) || null;
  return { found: !!dir, path: dir };
}

export const QUARTUS_HELP = {
  local: 'Install Intel Quartus Prime Lite Edition (free; its MAX 10, Cyclone IV and Cyclone V device support) on this Linux or Windows machine and put its quartus/bin on PATH, or set {"quartus":{"mode":"local","path":"/path/to/quartus/bin"}} in ~/.silinx/config.json or via PUT /api/toolchain.',
  docker: 'Set {"quartus":{"mode":"docker","image":"<your-quartus-image>"}}: an x86-64 image with Quartus Prime Lite and its device support, quartus_sh on PATH (or "path" its quartus/bin). Silinx never pulls or builds images; the build directory is mounted at /work.',
  ssh: 'Set {"quartus":{"mode":"ssh","image":"<image on the host, or empty>"}} with the ssh host of Toolchain Settings (ssh.host, ssh.user, ssh.remoteDir): the build directory is streamed with tar over ssh, Quartus runs there, and the results come back.',
};

/** Can Quartus's flow run in its mode? { mode, available, reason, help }. det: { quartus, helpers, dockerImage? }. */
export function quartusStatus(cfg, det) {
  const mode = cfg.quartus?.mode || 'local', image = cfg.quartus?.image || '', help = QUARTUS_HELP[mode] || QUARTUS_HELP.local;
  if (mode === 'local') {
    if (!det.helpers.bash) return { mode, available: false, reason: 'bash not found (the flow script run.sh needs bash)', help };
    if (det.quartus?.found) return { mode, available: true, reason: `Quartus found in ${det.quartus.path}`, help };
    return { mode, available: false, reason: `Intel Quartus Prime not found (looked for quartus_sh on PATH and under ${QUARTUS_GLOBS.join(', ')}).${process.platform === 'darwin' ? ' Quartus does not run on macOS; use the docker or ssh mode.' : ''}`, help };
  }
  if (mode === 'docker') {
    if (!det.helpers.docker) return { mode, available: false, reason: `'${cfg.docker?.command || 'docker'}' command not found`, help };
    if (!image) return { mode, available: false, reason: 'no Quartus docker image configured (quartus.image)', help };
    if (det.dockerImage && !det.dockerImage.present) return { mode, available: false, reason: `docker image '${image}' not present locally (docker image inspect failed). Build it yourself; Silinx never pulls images.`, help };
    return { mode, available: true, reason: `docker image ${image}`, help };
  }
  if (mode === 'ssh') {
    if (!det.helpers.ssh) return { mode, available: false, reason: 'ssh not found', help };
    if (!det.helpers.tar) return { mode, available: false, reason: 'tar not found (used to copy the build directory over ssh)', help };
    if (!cfg.ssh?.host) return { mode, available: false, reason: 'no ssh host configured (ssh.host)', help };
    return { mode, available: true, reason: `the ssh host${image ? ` (docker image ${image})` : ''}`, help };
  }
  return { mode, available: false, reason: `unknown Quartus mode '${mode}'`, help: QUARTUS_HELP.local };
}

/** The Quartus section of GET /api/toolchain: { mode, available, reason, help, version, dockerImage }. */
export async function detectQuartusToolchain(cfg, helpers, { capture } = {}) {
  const quartus = detectQuartus(cfg);
  let dockerImage = null;
  if ((cfg.quartus?.mode || 'local') === 'docker' && helpers.docker && cfg.quartus?.image && capture) {
    const r = await capture(helpers.docker, ['image', 'inspect', '--format', '{{.Id}}', cfg.quartus.image], { timeoutMs: 5000 });
    dockerImage = { image: cfg.quartus.image, present: r.code === 0 };
  }
  return { ...quartusStatus(cfg, { quartus, helpers, dockerImage }), version: QUARTUS_VERSION, dockerImage };
}

// ---------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------

/** Job body of an implementation on an Intel device: { project, projectDir, steps, generateOnly? }. */
export async function runQuartus(job, { project, projectDir, steps, generateOnly = false }) {
  const st = quartusSteps(steps);
  job.log(`Silinx implementation (Intel Quartus Prime): ${project.name} top=${project.top} device=${quartusTarget(project.device).device}`);
  const gen = await generateQuartusBuild(project, projectDir);
  for (const w of gen.warnings) job.log(`WARNING: ${w}`);
  job.log(`Generated ${gen.files.join(', ')} in ${gen.buildDir}`);
  const result = { buildDir: gen.buildDir, generated: gen.files, steps: st, warnings: gen.warnings, mode: null, reports: null, completedSteps: [], failedStep: null, toolchain: 'quartus' };
  if (generateOnly) { job.log('Scripts generated only (generateOnly). Run build/run.sh on a machine with Quartus.'); return result; }
  const cfg0 = await loadConfig(), cfg = quartusRunConfig(cfg0);
  const helpers = { bash: which('bash'), docker: which(cfg.docker.command || 'docker'), ssh: which('ssh'), tar: which('tar') };
  const status = quartusStatus(cfg0, { quartus: detectQuartus(cfg0), helpers });
  result.mode = cfg.mode;
  if (!status.available) {
    job.log(`Quartus is not available in mode '${cfg.mode}': ${status.reason}`);
    job.log(`How to fix: ${status.help}`);
    throw Object.assign(new Error(`Intel Quartus Prime not available (${cfg.mode} mode): ${status.reason.replace(/\.$/, '')}. Configure it in Toolchain Settings (quartus in ~/.silinx/config.json, PUT /api/toolchain), or run ${path.join(gen.buildDir, 'run.sh')} on a machine with Quartus.`), { result });
  }
  job.log(`Running the Quartus flow in '${cfg.mode}' mode: ${status.reason}`);
  const onLine = line => {
    let m = /^=== SILINX STEP (\w+) ===/.exec(line);
    if (m) { if (result.currentStep) result.completedSteps.push(result.currentStep); result.currentStep = m[1]; job.result = result; }
    m = /^=== SILINX FAILED (\w+)/.exec(line);
    if (m) { result.failedStep = m[1]; result.currentStep = null; }
    if (/^=== SILINX DONE ===/.test(line)) { if (result.currentStep) result.completedSteps.push(result.currentStep); result.currentStep = null; }
  };
  // the reports of an earlier run are not this one's
  if (st.includes('synth')) await fs.rm(path.join(gen.buildDir, 'output_files'), { recursive: true, force: true });
  let code;
  try {
    if (cfg.mode === 'local') {
      const bin = cfg0.quartus?.path || detectQuartus(cfg0).path;
      code = await runCommand(job, helpers.bash || 'bash', ['run.sh', ...st], { cwd: gen.buildDir, env: bin ? { QUARTUS_BIN: bin } : {}, onLine });
    } else if (cfg.mode === 'docker') code = await runDocker(job, cfg, gen, st, onLine);
    else code = await runSsh(job, cfg, { helpers }, project, gen, st, onLine, { env: cfg0.quartus?.path ? { QUARTUS_BIN: cfg0.quartus.path } : {} });
  } finally {
    try {
      result.reports = await collectQuartusReports(gen.buildDir, gen.top, gen.device, gen.clocks);
      await fs.writeFile(path.join(gen.buildDir, 'reports.json'), JSON.stringify(result.reports, null, 2) + '\n');
    } catch (e) { job.log(`WARNING: report parsing failed: ${e.message}`); }
  }
  if (code !== 0) throw Object.assign(new Error(`Quartus flow failed${result.failedStep ? ` in step '${result.failedStep}'` : ''} (exit code ${code})`), { result });
  job.log(result.reports?.bit ? `Programming file: ${result.reports.bit.path}` : 'Flow finished.');
  return result;
}
