// The MCP server's board programming (#2674, #2298): Configure Target Device's Program FPGA / Program Flash, through the
// server's own function (impl-routes.js startProgramming: the project trusted, its file, its board, its device checked, then
// server/programmer.js programJob), so with the same checks and messages as the interface's. The project's file is the one
// its flow makes: a Xilinx .bit and an ECP5's .bit loaded into the FPGA's SRAM (JTAG), a Gowin's .fs into its SRAM, an
// iCE40's .bin written into the board's SPI flash. Destructive: the client asks before each call. And the rest of Configure
// Target Device (#4751): the Platform Flash PROM (program, verify, back up, erase, reload the FPGA from it), the JTAG chain's
// scan, the bitstream's header; and what Toolchain Settings found, read only (the settings themselves are the user's, in the
// interface: core/mcp-parity.js).
import { toolError, readProject, redactor, PROJECT, STR } from './mcp-util.js';
import { TOOLS } from './programmer-values.js';

// (the most a programming waits: openFPGALoader writing a flash of 16 MB, iMPACT's Identify)
const TIMEOUT_MS = 600000;
// a System's nodes programmed (node: its id, or * every one; connected: its board picked by hand), program_board's result
async function programNodes(name, { node, connected, tool, position, force }, signal) {
  if (tool !== undefined || position !== undefined || force) throw toolError('node: a System node is programmed with its board\'s own programmer (no tool, position or force)');
  if (connected !== undefined && node === '*') throw toolError('connected: one node\'s board (node its id, not *)');
  const { startSystemProgram } = await import('./system-program.js');
  const job = await waited(() => startSystemProgram(name, { node, chosen: connected !== undefined ? { [node]: connected } : {} }), signal, 'programming');
  const redact = await redactor(), lines = job.lines.map(redact), ok = job.status === 'ok', r = job.result || {};
  const warnings = lines.filter(l => /^WARNING: /.test(l)).map(l => l.slice(9)), errors = lines.filter(l => /^ERROR: /.test(l)).map(l => l.slice(7));
  const head = ok ? `Programmed ${node === '*' ? 'the System' : `the System node ${node}`}: ${lines.filter(l => /^Program: /.test(l)).pop()?.slice(9) || ''}` : `Programming failed: ${redact(job.error || 'see the log')}`;
  return { text: [head, ...warnings.map(w => `WARNING: ${w}`), '', ...lines.slice(-40)].join('\n'), isError: !ok,
    data: { project: name, node, ok, programmed: r.programmed || [], errors, warnings, log: lines },
    untrusted: 'the programmers\' log, which quotes the project\'s file names' };
}

// a job of the server's (impl-routes.js) started and waited for, as the interface follows it: stopped when the call is
// cancelled or after TIMEOUT_MS; a refusal to start it (an untrusted project, no file) the tool's error
async function waited(start, signal, what) {
  let job;
  try { job = await start(); } catch (e) { throw toolError(e.message); }
  const end = Date.now() + TIMEOUT_MS;
  while (job.status === 'running' && Date.now() < end && !signal?.aborted) await new Promise(r => setTimeout(r, 100));
  if (job.status === 'running') {
    const { cancelJob } = await import('./jobs.js');
    cancelJob(job.id);
    throw toolError(signal?.aborted ? `${what} was cancelled: stopped` : `${what} did not end in ${TIMEOUT_MS / 1000} s: stopped`);
  }
  return job;
}
// a file of build/ by its name (never the project folder's path)
const buildFile = f => {
  const parts = String(f || '').split(/[\\/]/), i = parts.lastIndexOf('build');
  return f ? (i >= 0 ? parts.slice(i) : ['build', parts.pop()]).join('/') : null;
};
const PROM_OPS = ['program', 'verify', 'read', 'erase', 'reconfigure'];
// a reason of Toolchain Settings' detection, a programmer's log, with no host, user or path (#4751): the owner's secrets redacted (the ISE
// machine's address), then any path left, and the Docker image's name (an account's on a registry)
const pathless = t => String(t ?? '').replace(/docker image '?[^\s',)]+'?/gi, 'its Docker image').replace(/(^|[\s'"(=])(~|\$\w+|[A-Za-z]:)?[\\/][^\s'",;)]*/g, '$1<path>');

export const BOARD_TOOLS = [
  {
    name: 'program_board', title: 'Program the board',
    description: 'Program the project\'s board (Configure Target Device) with the file run_process bitstream made: a .bit into the FPGA\'s SRAM (Spartan-3E / 6, 7-series, the ULX3S\'s ECP5), a Gowin\'s .fs into its SRAM, an iCE40\'s .bin into the board\'s SPI flash, by its programmer (openFPGALoader, djtgcfg, adepttool, xc3sprog, iMPACT: tool). Another device\'s file is refused unless force. node: a System\'s, each on its board by USB id (Program All / Program Node), an FPGA over JTAG, an Arduino by arduino-cli upload. A trusted project only. Returns the log.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      tool: { type: 'string', enum: TOOLS, description: 'The programmer (default: the board\'s, else Toolchain Settings\').' },
      position: { type: 'integer', minimum: 1, maximum: 32, description: 'The FPGA\'s position in the JTAG chain, iMPACT\'s numbering from 1 (the Program view\'s "position N"), whatever the programmer (default: the board\'s FPGA). A Spartan-3E / 6 or 7-series .bit only.' },
      force: { type: 'boolean', description: 'Program a bitstream built for another device than the project\'s anyway (default false), warned.' },
      node: STR('A System node (* all).'),
      connected: STR('Its board by hand: a serial number or port.'),
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async run({ project: name, tool, position, force = false, node, connected }, { signal } = {}) {
      // (a System's node, or every one, on its board, #5489, #5447: server/system-program.js, Program All / Program Node)
      if (node !== undefined) return programNodes(name, { node, connected, tool, position, force }, signal);
      if (connected !== undefined) throw toolError('connected: the board of a System node (node)');
      const pj = await readProject(name);
      if (!pj.top) throw toolError(`'${name}' has no top module: set_top first`);
      const { startProgramming } = await import('./impl-routes.js');
      const job = await waited(() => startProgramming({ project: name, ...(tool && { tool }), ...(position != null && { position }), force }), signal, 'programming');
      const redact = await redactor(), lines = job.lines.map(redact), ok = job.status === 'ok', r = job.result || {};
      const warnings = r.warnings || [], file = r.bitfile ? `build/${r.bitfile.split(/[\\/]/).pop()}` : null;
      const head = ok ? `Programmed the board${pj.board ? ` (${pj.board})` : ''} with ${file}${r.target === 'flash' ? ' (its SPI flash)' : ''}.` : `Programming failed: ${redact(job.error || 'see the log')}`;
      return { text: [head, ...warnings.map(w => `WARNING: ${w}`), '', ...lines.slice(-40)].join('\n'), isError: !ok,
        data: { project: name, board: pj.board || null, ok, file, tool: r.options?.tool || null, target: r.target || 'sram', warnings, commands: r.commands || [], log: lines },
        untrusted: 'the programmer\'s log, which quotes the project\'s file names' };
    },
  },
  {
    name: 'program_prom', title: 'Program, verify, back up or erase the PROM',
    description: 'The board\'s Platform Flash PROM (the Basys2\'s XCF02S, the Nexys2\'s XCF04S), through adepttool and the board\'s USB: op program (the PROM erased and the project\'s build/<top>_prom.bit written, run_process bitstream first; verified unless verify false; the FPGA then loaded from it with reconfigure), verify (its contents against that file), read (a backup into build/prom-backup/), erase (the board then boots no design from flash), reconfigure (the FPGA loaded from the PROM: the mode jumper on ROM). Another device\'s file is refused unless force. A trusted project only. Returns the log.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      op: { type: 'string', enum: PROM_OPS, description: 'What to do: program, verify, read (a backup), erase, reconfigure.' },
      verify: { type: 'boolean', description: 'program: verify the PROM after writing it (default true).' },
      reconfigure: { type: 'boolean', description: 'program: load the FPGA from the PROM afterwards (default false).' },
      force: { type: 'boolean', description: 'program / verify: a file built for another device than the project\'s anyway (default false), warned.' },
    }, required: ['project', 'op'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async run({ project: name, op, verify = true, reconfigure = false, force = false }, { signal } = {}) {
      await readProject(name);
      const { startProm } = await import('./impl-routes.js');
      const job = await waited(() => startProm({ project: name, op, verify, reconfigure, force }), signal, `the PROM's ${op}`);
      // (the log's commands with no path of this computer's: the programmer's, its scripts')
      const redact = await redactor(), lines = job.lines.map(l => pathless(redact(l))), ok = job.status === 'ok', backup = buildFile(job.result?.outfile);
      const done = { program: `The PROM programmed${verify ? ' and verified' : ''}${reconfigure ? '; FPGA loaded from the PROM (DONE)' : ''}.`, verify: 'The PROM verified: contents match.',
        read: `PROM backup saved in ${backup}.`, erase: 'The PROM erased.', reconfigure: 'FPGA loaded from the PROM (DONE).' }[op];
      return { text: [ok ? done : `The PROM's ${op} failed: ${redact(job.error || 'see the log')}`, '', ...lines.slice(-40)].join('\n'), isError: !ok,
        data: { project: name, op, ok, ...(op === 'read' && ok ? { backup } : {}), log: lines },
        untrusted: 'the programmer\'s log, which quotes the project\'s file names' };
    },
  },
  {
    name: 'jtag_scan', title: 'Scan the JTAG chain',
    description: 'The devices of the board\'s JTAG chain (Configure Target Device\'s Initialize Chain, iMPACT\'s window): the FPGA and its PROM, by their IDCODE and name, through the board\'s programmer (openFPGALoader, Digilent\'s djtgcfg, adepttool, xc3sprog or iMPACT; tool to choose another). Nothing is written. The board: the project\'s, or board.',
    inputSchema: { type: 'object', properties: {
      project: { ...PROJECT, description: 'A project whose board is scanned (or board).' },
      board: STR('A board\'s id (list_devices), when no project is given.'),
      tool: { type: 'string', enum: TOOLS, description: 'The programmer (default: the board\'s, else Toolchain Settings\').' },
      cable: { type: 'string', description: 'The programmer\'s cable (its own name: digilent_hs2, nexys2, usb21…; default: the board\'s).' },
    }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run({ project: name, board, tool, cable }, { signal } = {}) {
      const pj = name ? await readProject(name) : null;
      const { startScan } = await import('./impl-routes.js');
      const job = await waited(() => startScan({ board: board || pj?.board || undefined, tool, cable }), signal, 'the scan');
      const redact = await redactor(), lines = job.lines.map(l => pathless(redact(l))), ok = job.status === 'ok', devices = job.result?.devices || [];
      const head = !ok ? `The scan failed: ${redact(job.error || 'see the log')}` : devices.length
        ? `${devices.length} device(s) in the JTAG chain: ${devices.map(d => [d.name, d.idcode].filter(Boolean).join(' ') || d.adeptDevice).join(', ')}.` : 'No device found in the JTAG chain (the board connected and on?).';
      return { text: [head, '', ...lines.slice(-40)].join('\n'), isError: !ok,
        data: { ok, board: board || pj?.board || null, tool: job.result?.options?.tool || tool || null, devices, log: lines } };
    },
  },
  {
    name: 'bitstream_info', title: 'The bitstream\'s header',
    description: 'The project\'s programming file, as Configure Target Device shows it: a Xilinx .bit\'s header (the design, the part and when it was built, warned when the part is not the project\'s device), an iCE40\'s .bin, an ECP5\'s .bit or a Gowin\'s .fs by its size; none when run_process bitstream has not made it.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run({ project: name }) {
      await readProject(name);
      const { bitInfo } = await import('./impl-routes.js');
      const b = await bitInfo(name), file = buildFile(b.path), open = b.available && b.part === undefined;   // (an open family's: no header)
      const text = b.reason ? `No bitstream: ${b.reason}.` : !b.available ? `No bitstream yet${file ? ` (${file})` : ''}: run_process bitstream first.${b.error ? ` ${b.error}` : ''}`
        : open ? `Bitstream ${file}: ${b.size} bytes.`
          : `Bitstream ${file}: design ${b.designName || ''}, part ${b.part || ''}, built ${b.date || ''} ${b.time || ''}.${b.warning ? `\nWARNING: ${b.warning}` : ''}`;
      return { text, data: { project: name, available: !!b.available, file, ...(b.available && !open ? { design: b.designName || null, part: b.part || null, date: b.date || null, time: b.time || null, warning: b.warning || null } : {}),
        ...(open ? { size: b.size } : {}) }, untrusted: 'the bitstream\'s header, which names the design' };
    },
  },
  {
    name: 'toolchain_info', title: 'What Toolchain Settings found',
    description: 'Toolchain Settings\' state, read only: the ISE mode (silinx: the Silinx toolchain, no ISE; local, docker, ssh), whether ISE 14.7, Vivado, arduino-cli, XC16 and arm-none-eabi-gcc can run, and why not. No host, user or path is shown; the settings are changed only in the interface (Toolchain Settings, the gear in the toolbar): this computer\'s.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run() {
      const { detectToolchain } = await import('./toolchain.js');
      const t = await detectToolchain(), redact = await redactor();
      const clean = st => ({ mode: st?.mode ?? null, available: !!st?.available,
        // (ssh's reason names its host and user: said without them)
        reason: st?.mode === 'ssh' && st.available ? 'a remote host over ssh' : pathless(redact(st?.reason || '')) });
      const ise = clean(t.ise), vivado = clean(t.vivado);
      // (an Arduino node's compiler, #5503: its version and its AVR core's)
      const a = await (await import('./avr-compile.js')).detectAvrCompiler();
      const arduino = { available: a.available, version: a.version, core: a.core, reason: pathless(redact(a.reason)) };
      // (a PIC24 node's, #5482: this computer's XC16 or the ISE machine's image, which one and why not the other)
      const x = await (await import('./xc16-compile.js')).detectXc16();
      const said = r => pathless(redact(r));
      const xc16 = { available: x.available, via: x.via, version: x.version, reason: said(x.reason), local: said(x.local.reason), remote: said(x.remote.reason) };
      // (a Zynq board's PS program's, #4687: arm-none-eabi-gcc)
      const g = await (await import('./zynq-ps-compile.js')).detectArmGcc();
      const armGcc = { available: g.available, version: g.version, reason: said(g.reason) };
      return { text: [`ISE: mode ${ise.mode}, ${ise.available ? 'available' : 'not available'}: ${ise.reason}.`,
        `AMD Vivado: ${vivado.available ? 'available' : 'not available'}${vivado.reason ? `: ${vivado.reason}` : ''}.`,
        `Arduino (Compile Firmware): ${arduino.available ? 'available' : 'not available'}: ${arduino.reason}.`,
        `XC16${xc16.version ? ` ${xc16.version}` : ''} (a PIC24's Compile Firmware): ${xc16.available ? `available, ${xc16.via === 'local' ? 'on this computer' : 'on the ISE machine'}` : 'not available'}: ${xc16.reason}.`,
        `arm-none-eabi-gcc (a Zynq's Compile PS Program): ${armGcc.available ? 'available' : 'not available'}: ${armGcc.reason}.`].join('\n'), data: { ise, vivado, arduino, xc16, armGcc } };
    },
  },
  {
    name: 'serial_terminal', title: 'A real board\'s serial terminal',
    description: 'A real board\'s USB serial port, as a System terminal\'s Real Board: send text, read the answer for listen_ms (default 2000). The port: given, or a System node\'s board by USB id (a terminal: its link\'s board), at its UART\'s baud and frame. Through arduino-cli\'s monitor.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, node: STR('A System node.'), port: STR('A port address (COM3).'), baud: { type: 'integer', minimum: 1 }, frame: { type: 'string', pattern: '^[5-8][NEOneo][12]$' },
      send: STR('Text sent (\\n: Enter).'), send_after_ms: { type: 'integer', minimum: 0, maximum: 30000 }, listen_ms: { type: 'integer', minimum: 0, maximum: 30000 },
    }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async run({ project, node, port, baud, frame, send = '', send_after_ms: after = 0, listen_ms: listen = 2000 }) {
      const { serialPortOf, serialSession } = await import('./serial-monitor.js');
      let at, r;
      try { at = await serialPortOf({ project, node, port, baud, frame }); } catch (e) { throw toolError(e.message); }
      try { r = await serialSession({ port: at.port, link: at.link, send: [...Buffer.from(send, 'utf8')], sendAfterMs: after, listenMs: listen }); } catch (e) { throw toolError(e.message); }
      const head = `Serial port ${at.port}${at.node ? ` (the board of ${at.node})` : ''} at ${at.link.baud} baud, ${at.link.frame}: ${r.bytes.length} byte(s) received in ${listen} ms, ${r.sent} sent.`;
      return { text: [head, '', r.text].join('\n'),
        data: { port: at.port, node: at.node, baud: at.link.baud, frame: at.link.frame, sent: r.sent, received: r.bytes.length, text: r.text, warnings: [] },
        untrusted: 'what the board sent on its serial port' };
    },
  },
];
