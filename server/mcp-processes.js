// The MCP server's tools of the processes (server/mcp.js, #134): running a process, reading its reports.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, clip, redactor, projectPath, readProject, PROJECT, STR } from './mcp-util.js';
import { designUtilization } from '../core/summary-utilization.js';
import { severityOf } from '../core/log-severity.js';
import { lineMessage, messageData } from '../core/message.js';
import { messageLocation, projectPath as sourcePath } from '../core/message-location.js';
import { MODEL_PROCESS, hasSimModels, noSimModelMessage, silinxFlowOf } from './mcp-hdl.js';
import { ISE, processSteps } from '../core/tool-descriptors.js';
import { isSystemProject } from '../core/project-kind.js';
import { systemFlowRefusal } from '../core/system-top.js';

// run_process's processes: those of the interface's tree (core/tool-descriptors.js, the Xilinx flow's names, #4751), each
// the steps its process runs (processSteps): the flow up to its stage, then its own step (the simulation models: Generate
// Post-… Simulation Model, #2674)
const PROCESS_IDS = {
  synthesize: 'synth', implement: 'impl', bitstream: 'bitgen', timing: 'trce', power: 'xpwr', pins: 'pin2ucf',
  post_synthesis_model: 'postsynth', post_translate_model: 'posttrans', post_map_model: 'postmap', post_par_model: 'postpar',
};
export const PROCESSES = Object.fromEntries(Object.entries(PROCESS_IDS).map(([name, id]) => [name, processSteps(ISE, id)]));
// a report of the build folder: its file, by the toolchain of the last run (#460: the Silinx toolchain
// writes Yosys's statistics, no map or par report: those two are made from its Design Summary)
export const REPORT_FILES = {
  open: {
    power: top => `build/${top}.pwr`,
    timing: () => 'build/open/timing.txt',
    synthesis: top => `build/open/${top}_stat.txt`,
    map: null,
    par: null,
    pins: top => `build/${top}_pins.ucf`,
    drc: null,
  },
  ise: {
    power: top => `build/${top}.pwr`,
    timing: top => `build/${top}.twr`,
    synthesis: top => `build/${top}.syr`,
    map: top => `build/${top}_map.mrp`,
    par: top => `build/${top}.par`,
    pins: top => `build/${top}_pins.ucf`,
    drc: null,
  },
  // AMD Vivado's (the 7-series, #1649, server/vivado.js): report_utilization after synthesis and after routing,
  // report_route_status, report_timing_summary, report_power, report_io, report_drc
  vivado: {
    power: top => `build/${top}_power.rpt`,
    timing: top => `build/${top}_timing.rpt`,
    synthesis: top => `build/${top}_synth_util.rpt`,
    map: top => `build/${top}_util.rpt`,
    par: top => `build/${top}_route.rpt`,
    pins: top => `build/${top}_io.rpt`,
    drc: top => `build/${top}_drc.rpt`,
  },
  // Intel Quartus Prime's (the Intel FPGAs, #5378, server/quartus.js): its tools' reports in output_files/
  quartus: {
    power: null,
    timing: top => `build/output_files/${top}.sta.rpt`,
    synthesis: top => `build/output_files/${top}.map.rpt`,
    map: top => `build/output_files/${top}.fit.rpt`,
    par: top => `build/output_files/${top}.fit.summary`,
    pins: top => `build/output_files/${top}.pin`,
    drc: null,
  },
};
const TOOLCHAIN_NAMES = { silinx: 'Silinx toolchain', ise: 'Xilinx ISE', vivado: 'AMD Vivado', quartus: 'Intel Quartus Prime', arduino: 'arduino-cli', 'avr-asm': 'Silinx\'s AVR assembler', xc16: 'XC16', 'arm-gcc': 'arm-none-eabi-gcc', 'arduino+xc16': 'arduino-cli and XC16', system: 'its nodes\' toolchains' };
// the map and par reports of a Silinx toolchain run, from its Design Summary (build/reports.json); the router's passes
// only when the engine counts them (nextpnr's do not, #2420)
export const OPEN_REPORTS = {
  map: r => r.map && [`Design summary (pack, Silinx toolchain) of ${r.top}:`, ...(r.map.utilization || []).map(u => `  ${u.name}: ${u.used}${u.total ? ` out of ${u.total} ${u.percent}%` : ''}`),
    `${r.map.errors ?? 0} error(s), ${r.map.warnings ?? 0} warning(s).`].join('\n'),
  // (the nets and PIPs when the routed design is XDL, the Xilinx families'; the timing's model when it is said, the 7-series'
  // nextpnr's estimate, #3146)
  par: r => r.par && [`Place and route (Silinx toolchain) of ${r.top}: ${r.par.routed ? 'all signals are completely routed' : `${r.par.unroutedSignals} signal(s) not routed`}${r.par.nets != null ? ` (${r.par.nets} nets, ${r.par.pips} PIPs${r.par.iterations != null ? `, ${r.par.iterations} passes` : ''})` : ''}.`,
    ...(r.timing ? [`Timing constraints: ${r.timing.met === false ? `not met (${r.timing.timingErrors})` : r.timing.met === null ? 'none' : 'all met'}${r.timing.minPeriodNs ? `; minimum period ${r.timing.minPeriodNs} ns (${r.timing.maxFreqMHz} MHz)` : ''}${r.timing.model ? `, ${r.timing.model}` : ''}.`] : [])].join('\n'),
};

/** run_process's text: the run's errors and warnings, then '…' and the end of its log, then its result; no '…' with
 *  nothing before it (#2795). */
export function processText({ errors, warnings, lines, head, logLines = 40 }) {
  return clip([...(errors.length || warnings.length ? [...errors, ...warnings, '…'] : []), ...lines.slice(-Math.max(1, logLines)), head].join('\n'));
}

/** A process's log's errors and warnings, as the console classes them (#4730: core/log-severity.js, the interface's
 *  console and its count of warnings): ISE's, Vivado's (its critical warnings too, #1649), Yosys's and nextpnr's. */
export function processMessages(lines, paths = []) {
  const errors = lines.filter(l => severityOf(l) === 'error'), warnings = lines.filter(l => severityOf(l) === 'warning');
  // (#4746: each one's file and line, as the Errors / Warnings tabs open them, when the project holds that file)
  const locations = [];
  for (const [severity, list] of [['error', errors], ['warning', warnings]]) {
    for (const text of list) {
      const at = messageLocation(text), file = at && sourcePath(at.file, paths);
      if (file) locations.push({ severity, text, file, line: at.line, ...(at.col ? { col: at.col } : {}) });
    }
  }
  return { errors, warnings, locations };
}

/** A process's messages (#4749: as the interface's console makes them, core/message.js lineMessage): its errors' and
 *  warnings' lines, Implementation's, each with its tool and location (the project's file its text names), then its
 *  result's line. */
export function processMessageList({ errors, warnings, head, ok, process, paths = [] }) {
  const of = (text, cls) => messageData(lineMessage(text, { cls, source: 'impl', process, paths }));
  return [...errors.map(l => of(l, 'err')), ...warnings.map(l => of(l, 'warn')), of(head, ok ? 'ok' : 'err')];
}

/** A process of the project's top run to its end (or stopped after timeoutS): its log redacted, its errors and
 *  warnings, whether it ended well, its toolchain. Errors: tool errors. */
export async function runProcess(name, proc, { toolchain, node, timeoutS = 1800, signal, progress } = {}) {
  const pj = await readProject(name);
  // (a System's Arduino node's firmware compiled by arduino-cli, #5503, a PIC24's by XC16, #5482: server/avr-compile.js, the
  // node's Compile Firmware)
  if (proc === 'firmware') return runFirmware(name, { toolchain, node, timeoutS, signal, progress });
  // (a System built by its plan, the nodes not up to date, the FPGAs first, #5489: server/system-build-all.js, Build All)
  if (proc === 'build') return runBuild(name, { toolchain, node, timeoutS, signal, progress });
  // (a Zynq board's PS program compiled by arm-none-eabi-gcc, #4687: server/zynq-ps-compile.js, Compile PS Program)
  if (proc === 'ps') return runPs(name, { toolchain, node, timeoutS, signal, progress });
  const steps = PROCESSES[proc];
  if (!steps) throw toolError(`process: one of ${[...Object.keys(PROCESSES), 'firmware', 'ps', 'build'].join(', ')}`);
  // (a System's FPGA node, or every one, on its own board, #5446: server/system-implement.js; else its top's)
  if (node === undefined && !pj.top) throw toolError(isSystemProject(pj) ? systemFlowRefusal(name) : `the project '${name}' has no top module`);   // (a System its top, #5443)
  // (a node's simulation models too, its emulation's, #5612)
  if (node !== undefined && ![...['synthesize', 'implement', 'bitstream'], ...Object.values(MODEL_PROCESS)].includes(proc)) throw toolError(`node: a System node runs synthesize, implement, bitstream or a simulation model (not ${proc})`);
  // (a model the flow does not make: refused, as simulate refuses it, #3707)
  const model = Object.keys(MODEL_PROCESS).find(m => MODEL_PROCESS[m] === proc);
  const silinx = silinxFlowOf(pj, toolchain);
  if (node === undefined && model && !hasSimModels(pj.device, model, { silinx })) throw toolError(noSimModelMessage(pj.device, model, { silinx }));
  const { startImplementation } = await import('./impl-routes.js');
  let job;
  try { job = await startImplementation(name, { steps, ...(toolchain ? { toolchain } : {}), ...(node !== undefined ? { node } : {}) }); } catch (e) { throw toolError(e.message); }
  const lines = await waitFor(job, proc, { timeoutS, signal, progress });
  const paths = (await P.readSources(name).catch(() => [])).map(s => s.path);
  const { errors, warnings, locations } = processMessages(lines, paths);
  const tc = ['silinx', 'vivado', 'quartus'].includes(job.meta?.toolchain) ? job.meta.toolchain : 'ise';
  return { top: node === undefined ? pj.top : node === '*' ? 'System' : `node ${node}`, lines, errors, warnings, locations, paths, ok: job.status === 'ok', silinx: tc === 'silinx', toolchain: tc };
}

// a node's firmware compiled (node: its id, or * every Arduino and PIC24 node): run_process firmware's result, as a flow's
async function runFirmware(name, { toolchain, node, timeoutS, signal, progress }) {
  if (node === undefined) throw toolError('node: the firmware process compiles a System microcontroller node\'s firmware (its id, or * every Arduino and PIC24 node)');
  if (toolchain !== undefined) throw toolError('toolchain: a firmware is compiled by arduino-cli or XC16 (no toolchain to choose)');
  let job;
  try { job = await (await import('./avr-compile.js')).startFirmwareCompile(name, { node }); } catch (e) { throw toolError(e.message); }
  const lines = await waitFor(job, 'firmware', { timeoutS, signal, progress });
  // (the node's sources: its sketch's files, the messages' locations)
  const paths = await P.fileTree(name).catch(() => []);
  const { errors, warnings, locations } = processMessages(lines, paths);
  return { top: node === '*' ? 'System' : `node ${node}`, lines, errors, warnings, locations, paths, ok: job.status === 'ok', silinx: false, toolchain: job.meta?.toolchain || 'arduino' };
}

// a Zynq board's PS program compiled (node: a System's Zynq node's id; none in a Board project): run_process ps's result
async function runPs(name, { toolchain, node, timeoutS, signal, progress }) {
  if (toolchain !== undefined) throw toolError('toolchain: a PS program is compiled by arm-none-eabi-gcc (no toolchain to choose)');
  let job;
  try { job = await (await import('./zynq-ps-compile.js')).startPsCompile(name, { node }); } catch (e) { throw toolError(e.message); }
  const lines = await waitFor(job, 'ps', { timeoutS, signal, progress });
  const paths = await P.fileTree(name).catch(() => []);
  const { errors, warnings, locations } = processMessages(lines, paths);
  return { top: node === undefined ? 'PS program' : `node ${node}`, lines, errors, warnings, locations, paths, ok: job.status === 'ok', silinx: false, toolchain: 'arm-gcc' };
}

// a System's FPGA node's report (#5632): its Design Summary (its device's utilization rows), or a report of its last run,
// the Silinx toolchain's, its files in its build folder (build/nodes/<id>/build/), its module its top
async function nodeReport(name, report, node) {
  if (report !== 'summary' && !Object.hasOwn(REPORT_FILES.open, report)) throw toolError(`report: summary or one of ${Object.keys(REPORT_FILES.ise).join(', ')}`);
  const redact = await redactor();
  let r;
  try { r = JSON.parse(redact(JSON.stringify(await (await import('./impl-routes.js')).projectReports(name, { node })))); } catch (e) { throw toolError(e.message); }
  const at = `node ${node}`, base = `build/nodes/${r.node}/`;
  if (r.available === false) return { text: `No report yet for ${at} of '${name}': run_process implement with node ${node}.`, data: { project: name, node, report, available: false } };
  if (report === 'summary') {
    const pj = await readProject(name);
    const { nodeProject } = await import('../core/system-node.js');
    const { readSystem, isSystemFile } = await import('../core/system-doc.js');
    const files = await P.fileTree(name), sys = files.find(isSystemFile);
    const n = readSystem(await P.readFile(name, sys)).system.nodes.find((x) => x.id === r.node);
    const device = nodeProject(pj, n, '').device;
    const { findPart } = await import('./devices.js');
    r.designSummary = { utilization: designUtilization(r, findPart(device.part) || null, device.package) };
    return { text: clip(JSON.stringify(r, null, 1)), data: { project: name, node, report, available: true, summary: r }, untrusted: 'the report' };
  }
  const file = REPORT_FILES.open[report]?.(r.module);
  if (!file) {
    const text = OPEN_REPORTS[report]?.(r);
    if (text) return { text: redact(text), data: { project: name, node, report, toolchain: 'silinx', path: `${base}build/reports.json`, available: true }, untrusted: 'the report' };
  } else {
    const full = await projectPath(name, `${base}${file}`);
    if (fs.existsSync(full)) return { text: clip(redact(await fsp.readFile(full, 'latin1'))), data: { project: name, node, report, toolchain: 'silinx', path: `${base}${file}`, available: true }, untrusted: 'the report' };
  }
  return { text: `No ${report} report for ${at} of '${name}' from its last run (Silinx toolchain${file ? `: ${base}${file}` : ''}).`, data: { project: name, node, report, toolchain: 'silinx', available: false } };
}

// a System built (node: its id, or * every node not up to date): run_process build's result, as a flow's
async function runBuild(name, { toolchain, node = '*', timeoutS, signal, progress }) {
  if (toolchain !== undefined) throw toolError('toolchain: a System is built by its nodes\' own (the Silinx toolchain, arduino-cli)');
  let job;
  try { job = await (await import('./system-build-all.js')).startSystemBuild(name, { node }); } catch (e) { throw toolError(e.message); }
  const lines = await waitFor(job, 'build', { timeoutS, signal, progress });
  const paths = await P.fileTree(name).catch(() => []);
  const { errors, warnings, locations } = processMessages(lines, paths);
  return { top: node === '*' ? 'System' : `node ${node}`, lines, errors, warnings, locations, paths, ok: job.status === 'ok', silinx: false, toolchain: 'system' };
}

// a job followed to its end (stopped after timeoutS, or when the client cancels): its lines redacted
async function waitFor(job, proc, { timeoutS, signal, progress }) {
  const end = Date.now() + timeoutS * 1000;
  // (its log's lines as its progress, when the client asks for it: the count, the last line redacted, #4734)
  const redactLine = progress ? await redactor() : null;
  const tell = () => { if (progress && job.lines.length) progress(job.lines.length, redactLine(job.lines[job.lines.length - 1])); };
  while (job.status === 'running' && Date.now() < end && !signal?.aborted) { tell(); await new Promise(r => setTimeout(r, 250)); }
  tell();
  if (job.status === 'running') {
    const { cancelJob } = await import('./jobs.js');
    cancelJob(job.id);
    throw toolError(signal?.aborted ? `the process ${proc} was cancelled: stopped` : `the process ${proc} did not end in ${timeoutS} s: stopped`);
  }
  const redact = await redactor();
  return job.lines.map(redact);
}

// run_process's bounds (#3408): how long it waits (then the process is stopped), the lines of the log returned
const PROCESS_LIMITS = Object.freeze({ timeoutS: 7200, logLines: 1000 });

export const PROCESS_TOOLS = [
  {
    name: 'run_process', title: 'Run a process',
    description: 'Run a process and wait: synthesize, implement, bitstream (Generate Programming File), timing, power, pins (Back-annotate Pin Locations), post_synthesis_model / post_translate_model / post_map_model / post_par_model (then simulate with model); firmware: an MCU node\'s C to its .hex (arduino-cli, XC16); ps: a Zynq PS\'s C (arm-none-eabi-gcc); build: a System\'s out-of-date nodes, by its plan. The Silinx toolchain by default; toolchain ise (Xilinx ISE, when configured) or vivado (AMD Vivado, 7-series; no simulation models; the Artix-7 and Zynq-7000 logic also silinx, on trial). Returns the errors, the warnings (with files and lines) and the log\'s end.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, process: { type: 'string', enum: [...Object.keys(PROCESSES), 'firmware', 'ps', 'build'], description: 'The process.' },
      toolchain: { type: 'string', enum: ['silinx', 'ise', 'vivado', 'quartus'], description: 'The toolchain (default: the project\'s synthesis tool, else Toolchain Settings).' },
      node: STR('A System node\'s id (* all): an FPGA\'s; firmware: an MCU\'s; ps: a Zynq\'s; build: any.'),
      log_lines: { type: 'integer', description: `The lines of the end of the log returned (default 40; from 1 to ${PROCESS_LIMITS.logLines}).` },
      timeout_s: { type: 'integer', description: `How long to wait, in seconds (default 1800; from 1 to ${PROCESS_LIMITS.timeoutS}): then the process is stopped.` },
    }, required: ['project', 'process'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run({ project: name, process: proc, toolchain, node, log_lines: logLines = 40, timeout_s: timeoutS = 1800 }, { signal, progress } = {}) {
      if (!Number.isInteger(logLines) || logLines < 1 || logLines > PROCESS_LIMITS.logLines) throw toolError(`log_lines: from 1 to ${PROCESS_LIMITS.logLines}`);
      if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > PROCESS_LIMITS.timeoutS) throw toolError(`timeout_s: from 1 to ${PROCESS_LIMITS.timeoutS} s`);
      const { top, lines, errors, warnings, locations, paths, ok, toolchain: tc } = await runProcess(name, proc, { toolchain, node, timeoutS, signal, progress });
      // (a project shared live: its followers see the run, #4002)
      await (await import('./mcp-collab.js')).sharedRun(name, { steps: PROCESSES[proc] || [proc], ok, warnings, lines }).catch(() => {});
      const pj = { top };
      const head = `Process "${proc}" of <${pj.top}> ${ok ? `completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''}` : `failed (${errors.length} error(s), ${warnings.length} warning(s))`} (${TOOLCHAIN_NAMES[tc]}).`;
      return { text: processText({ errors, warnings, lines, head, logLines }),
        data: { project: name, process: proc, toolchain: tc, ok, errors, warnings, locations, log: lines.slice(-Math.max(1, logLines)), messages: processMessageList({ errors, warnings, head, ok, process: proc, paths }) }, isError: !ok,
        // (a failure's errors and log quote the design's names and files: the project's own text, #3681)
        untrusted: ok ? undefined : 'the process\'s messages, which quote the design\'s names and files' };
    },
  },
  {
    name: 'get_report', title: 'Read a report',
    description: 'The Design Summary of the last run (summary: the utilization, the timing, the files, as JSON; designSummary.utilization: the Device Utilization Summary\'s caption and rows, as the interface shows them), or the text of a report of the last run: synthesis, map, par, timing, power, pins, drc (with the Silinx toolchain: Yosys\'s statistics for synthesis, the pack and route summaries for map and par; with AMD Vivado: its utilization after synthesis and after routing, its route status, timing summary, power, I/O and DRC reports).',
    inputSchema: { type: 'object', properties: { project: PROJECT, report: { type: 'string', enum: ['summary', ...Object.keys(REPORT_FILES.ise)], description: 'The report (default summary).' }, node: STR('A System\'s FPGA node\'s.') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, report = 'summary', node }) {
      // (a System's FPGA node's, #5632: its build folder's, build/nodes/<id>/, the Silinx toolchain's; its own device)
      if (node !== undefined) return nodeReport(name, report, node);
      const pj = await readProject(name);
      const redact = await redactor();
      if (report === 'summary') {
        const { projectReports } = await import('./impl-routes.js');
        const r = JSON.parse(redact(JSON.stringify(await projectReports(name))));
        if (r.available === false) return { text: `No report yet for '${name}': run a process (run_process).`, data: { project: name, report, available: false } };
        // (the Design Summary's Device Utilization Summary, as the interface shows it: the family's own rows, #4512)
        const { findPart } = await import('./devices.js');
        r.designSummary = { utilization: designUtilization(r, findPart(pj.device?.part) || null, pj.device?.package) };
        return { text: clip(JSON.stringify(r, null, 1)), data: { project: name, report, available: true, summary: r }, untrusted: 'the report' };
      }
      if (!Object.hasOwn(REPORT_FILES.ise, report)) throw toolError(`report: summary or one of ${Object.keys(REPORT_FILES.ise).join(', ')}`);
      // the toolchain of the last run (its Design Summary), else the files there are
      const { projectReports } = await import('./impl-routes.js');
      const summary = await projectReports(name).catch(() => ({ available: false }));
      const top = pj.top || 'top';
      const build = path.join(P.projectDir(name), 'build');
      const tc = summary.available !== false ? ({ open: 'silinx', vivado: 'vivado', quartus: 'quartus' })[summary.source] || 'ise'
        : fs.existsSync(path.join(build, 'run.tcl')) ? 'vivado' : fs.existsSync(path.join(build, `${top}.qpf`)) ? 'quartus' : fs.existsSync(path.join(build, `${top}.syr`)) ? 'ise' : 'silinx';
      const open = tc === 'silinx', who = TOOLCHAIN_NAMES[tc];
      const file = REPORT_FILES[open ? 'open' : tc][report]?.(top);
      if (!file) {
        const text = summary.available !== false && OPEN_REPORTS[report]?.(summary);
        if (text) return { text: redact(text), data: { project: name, report, toolchain: 'silinx', path: 'build/reports.json', available: true }, untrusted: 'the report' };
      } else {
        const full = await projectPath(name, file);
        if (fs.existsSync(full)) { const text = redact(await fsp.readFile(full, 'latin1')); return { text: clip(text), data: { project: name, report, toolchain: tc, path: file, available: true }, untrusted: 'the report' }; }
      }
      const proc = { synthesis: 'synthesize', map: 'implement', par: 'implement', timing: 'timing', power: 'power', pins: 'pins', drc: 'implement' }[report];
      return { text: summary.available === false && !fs.existsSync(path.join(P.projectDir(name), 'build')) ? `No ${report} report for '${name}': no process has run yet (run_process ${proc}).`
        : `No ${report} report for '${name}' from its last run (${who}${file ? `: ${file}` : ''}): run_process ${proc} first.`, data: { project: name, report, toolchain: tc, available: false } };
    },
  },
];
