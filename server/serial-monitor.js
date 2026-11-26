// Silinx - a real board's serial port from the local server (#5449, docs/SYSTEMS.md, Real boards): the MCP's
// serial_terminal, the System terminal's Real Board of the interface (web/js/system-serial-ui.js, over Web Serial) done
// by the server. arduino-cli's monitor (which the user installs; Silinx adds no serial library) opens the port at the
// link's baud and frame (core/serial-line.js monitorConfig), the bytes given are sent, and what the board sends for a
// while is read, as the terminal shows it (the simulation's text). The board's port: one given, or its System node's
// board matched by its USB id (core/system-usb.js), as Program Node's.
//
//   const r = await serialSession({ port: '/dev/cu.usbmodem101', link: { baud: 9600, frame: '8N1' }, send, listenMs });
//   r.text, r.bytes, r.sent
import { spawn } from 'node:child_process';
import { loadConfig } from './toolchain.js';
import { arduinoCliPath } from './avr-compile.js';
import { listUsbDevices } from './usb-devices.js';
import { monitorConfig, serialOptions, terminalPeer } from '../core/serial-line.js';
import { bytesText } from '../core/system-run.js';
import { deviceText, matchBoards } from '../core/system-usb.js';

// (the most a session listens, ms)
const MAX_LISTEN_MS = 30000;

/**
 * A session on the serial port `port` (an address: /dev/cu.usbmodem101, COM3) at `link`'s baud and frame: `send` (bytes)
 * written after `sendAfterMs` (an Arduino restarts when its port opens: its bootloader's half second), then the port read
 * until `listenMs` from its opening. { text (the terminal's), bytes: [{ t (ms), byte }], sent, cli }. Throws when there is
 * no arduino-cli, or when the monitor ends with an error before the time (the port not there, busy).
 */
export async function serialSession({ port, link = {}, send = [], sendAfterMs = 0, listenMs = 2000 } = {}) {
  if (!port) throw new Error('no serial port: give the board\'s (its address: /dev/cu.usbmodem101, COM3) or its node');
  const config = monitorConfig(link);
  const cli = arduinoCliPath(await loadConfig());
  if (!cli) throw new Error('a real board\'s serial port needs arduino-cli on the local server (its monitor opens the port; install it from arduino.cc)');
  const wait = Math.min(Math.max(0, Number(listenMs) || 0), MAX_LISTEN_MS);
  const child = spawn(cli, ['monitor', '-p', port, '-c', config, '--quiet'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const t0 = Date.now(), bytes = [], err = [];
  child.stdout.on('data', d => { const t = Date.now() - t0; for (const byte of d) bytes.push({ t, byte }); });
  child.stderr.on('data', d => err.push(String(d)));
  child.stdin.on('error', () => { /* (the monitor gone: said by its exit) */ });
  const ended = new Promise(r => { child.on('exit', code => r({ code })); child.on('error', e => r({ code: -1, error: e })); });
  let sent = 0;
  const writer = setTimeout(() => { if (send.length) { child.stdin.write(Buffer.from(send)); sent = send.length; } }, Math.min(sendAfterMs, wait));
  const timer = new Promise(r => setTimeout(() => r(null), wait));
  const early = await Promise.race([ended, timer]);
  clearTimeout(writer);
  if (early) {
    const why = early.error?.message || err.join('').trim().split('\n').filter(Boolean).slice(-2).join(' ') || `exit code ${early.code}`;
    if (early.code !== 0) throw new Error(`arduino-cli monitor on ${port}: ${why.slice(0, 300)}`);
  } else {
    child.stdin.end();
    child.kill('SIGTERM');
    await Promise.race([ended, new Promise(r => setTimeout(r, 1000))]);
  }
  return { text: bytesText(bytes), bytes, sent, cli };
}

/**
 * The port and the link of a session: `port` given, or the board of the System node `node` of the project `project` (an
 * Arduino's or an FPGA board's matched by its USB id, as Program Node's; a terminal node: the board at its link's other
 * end); its baud and frame given, else the node's UART's (the terminal's), else 9600 8N1. { port, link: { baud, frame },
 * node (the board's node, or null) }; throws why there is none.
 */
export async function serialPortOf({ project, node, port, baud, frame } = {}) {
  const pick = u => ({ baud: baud ?? u?.baud ?? 9600, frame: String(frame ?? u?.frame ?? '8N1').toUpperCase() });
  if (!node) {
    if (project) throw new Error('project: with node, a node of its System (or port alone)');
    if (!port) throw new Error('port or node: the board\'s serial port (its address), or a System node whose board is connected');
    const link = pick(null);
    serialOptions(link);
    return { port, link, node: null };
  }
  if (!project) throw new Error('node: a node of a System project\'s System, with its project');
  const { projectSystemOf } = await import('./system-plan.js');
  const { model } = await projectSystemOf(project);
  let n = model.nodes.find(x => x.id === node);
  if (!n) throw new Error(`no node '${node}' in the System of '${project}' (${model.nodes.map(x => x.id).join(', ') || 'none'})`);
  const link = pick((n.interfaces || []).find(i => i.kind === 'uart'));
  serialOptions(link);
  if (n.kind === 'terminal') {
    const p = terminalPeer(model, n.id);
    if (!p.node) throw new Error(`the terminal ${n.id} has no UART link to a board`);
    n = p.node;
  }
  if (n.kind !== 'mcu' && n.kind !== 'fpga') throw new Error(`${n.id} is a ${n.kind} node: a real board's serial port is a microcontroller's or an FPGA board's`);
  if (!port) {
    const devices = await listUsbDevices();
    const m = matchBoards(model, devices).nodes.find(x => x.id === n.id);
    if (!m?.device) throw new Error(`${(m?.message || `${n.id}: no board for it`)}; or give its port`);
    if (!m.device.port) throw new Error(`${n.id}: its board (${deviceText(m.device)}) has no serial port Silinx sees: give its port (an FPGA board's, its USB-UART adapter's)`);
    port = m.device.port;
  }
  return { port, link, node: n.id };
}
