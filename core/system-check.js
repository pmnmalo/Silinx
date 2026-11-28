// A System document's check (#4697, docs/SYSTEMS.md): its errors and warnings, as the console says them (the System
// editor on save, Check System, the MCP server's check_system), each pointing at its node or link. Isomorphic module.
//   error    a node's or a link's id missing or twice; a kind, a board, a module, a firmware unknown; an interface's
//            fields (its baud, its frame, its pins, its direction); an FPGA node's port that is no port of its module,
//            of the wrong direction (a TX that is an input: TX and RX crossed), with no pin or a pin not on its board,
//            two ports on one pin; a microcontroller's pin not on its board, its UART's TX and RX not the board's; a
//            link's end unknown, of another kind, the same node at both ends; the baud or the frame different at its
//            ends; GPIO widths different; a pin driven twice; a pin (an interface) used by two links; an SPI or I²C
//            link's master not a microcontroller, its peripheral not an FPGA, its rate (and SPI's mode) different at its
//            ends; an I²C peripheral's SDA not an inout port (#5214)
//   warning  a baud that is no standard rate; a GPIO wire nothing drives; a 5 V output on a 3.3 V input (an FPGA's, a PIC24's); a node
//            that joins nothing (a circuit node's: core/system-check-circuit.js, #5215)
// Each node's resolved pins are its typed ports (#5485, core/system-ports.js: a direction, a kind, a level), each wire's
// ends checked against its link's kind (core/system-links.js endsProblem: the port kinds it joins, a driver and a driven
// end); the levels are there for the 3.3 V / 5 V check (#5498).
import { NODE_KINDS, LINK_KINDS, INTERFACE_KINDS, FRAME_RE, MCU_BOARDS, mcuBoard, linkEnd, nodeIdError } from './system-doc.js';
import { isName } from './ident.js';
import { resolveBoard } from './devices.js';
import { BAUDS } from './uart.js';
import { checkCircuitFields, checkCircuitNodes } from './system-check-circuit.js';
import { port } from './system-ports.js';
import { endsProblem } from './system-links.js';
import { usbError } from './usb-id.js';
import { RUNTIME_NAMES } from './rp2040-firmware.js';
import { withNodePins } from './system-constraints.js';
import { psProblems, psOfBoard } from './zynq-ps.js';
import { psMapProblems } from './zynq-ps-map.js';

const node = id => ({ kind: 'node', id });
const link = id => ({ kind: 'link', id });
const lc = s => String(s).toLowerCase();

// an I/O standard's voltage (LVCMOS33, LVTTL: 3.3 V; LVCMOS25: 2.5 V…; the iCE40's SB_LVCMOS: 3.3 V)
function ioVolts(std) {
  const m = /LVCMOS(\d)(\d)/i.exec(std || '');
  return m ? Number(`${m[1]}.${m[2]}`) : 3.3;
}

// an FPGA node's board: its pins ({ PIN: its I/O standard }), or null
function fpgaPins(n) {
  const r = n.board ? resolveBoard(n.board, { variant: n.variant }) : null;
  if (!r) return null;
  const pins = new Map(), labels = new Map();
  for (const res of r.resources) for (const p of res.pins) { const P = String(p).toUpperCase(); pins.set(P, res.iostandard || ''); if (!labels.has(P)) labels.set(P, res.label || res.name); }
  return { name: r.board.name, pins, labels };
}

// a module's port of a name (`led<0>`: a bus's bit), or undefined
function portOf(ports, name) {
  const m = /^(.+?)[<(\[](\d+)[>)\]]$/.exec(name);
  const base = m ? m[1] : name;
  const p = ports.find(q => lc(q.name) === lc(base));
  if (!p || (m && !(p.width > 1))) return undefined;
  return p;
}

/**
 * The System's problems: [{ severity: 'error' | 'warning', message, ref: { kind: 'node' | 'link', id } }]. `modules`: the
 * project's modules' ports by their names ({ name: [{ name, dir, width }], or null: its ports not known }; null: not checked); `files`: the project's
 * files (a firmware's checked among them; null: not checked).
 */
export const checkSystem = (sys, ctx = {}) => analyzeSystem(sys, ctx).diags;

/**
 * The System's check and its wires (#5216, the System editor's Wiring view): { diags, wires }, a wire { link, kind,
 * signal (TX, SCK, MOSI…, a GPIO wire's index), from, to (its driver first: { node, pin (a port of the FPGA's module,
 * a pin of a microcontroller's board), loc (an FPGA's package pin), dir, volts, std, place (what the FPGA board's
 * pin is: its resource's label) }), warnings (its level's) } of each
 * link whose ends resolve, in the links' order. `circuits`: the circuit nodes' circuits read ({ path: circuit }; null: their
 * boards and pins not checked, #5215). `constraints`: the project's FPGA nodes' constraints files ({ path: text }, #5581:
 * their pins read from them, core/system-constraints.js; null: the nodes' pins as the model has them). `texts`: the FPGA
 * nodes' PS–PL register maps read ({ path: text }, #4688: their bus checked; null: their places only).
 */
export function analyzeSystem(sys, { modules = null, files = null, circuits = null, constraints = null, texts = null } = {}) {
  const out = [], wires = [];
  // (the nodes' typed ports: { node: [port] }, each resolved pin of their interfaces once)
  const say = { err: (message, ref) => out.push({ severity: 'error', message, ref }), warn: (message, ref) => out.push({ severity: 'warning', message, ref }) };
  // (each FPGA node's pins its constraints file's, `constraints` the project's: { path: text }, #5581)
  const pinned = constraints ? withNodePins(sys, constraints) : null;
  if (pinned) sys = pinned.system;
  const nodes = checkNodes(sys, { modules, files, texts }, say);
  const used = checkLinks(sys, nodes, say, wires);
  for (const id of checkCircuitNodes(sys, { circuits, modules }, wires, say)) used.add(id);
  // (a System of one node, a processor board's Board project's, #5756: nothing to join it to, no warning)
  if (sys.nodes.length > 1) for (const n of sys.nodes) if (n.id && nodes.has(lc(n.id)) && !used.has(lc(n.id))) say.warn(`${n.id} joins nothing: no link reaches it`, node(n.id));
  // (its constraints files' problems, after the System's own)
  for (const p of pinned?.problems ?? []) (p.severity === 'error' ? say.err : say.warn)(p.message, node(p.node));
  return { diags: out, wires, ports: nodePorts(nodes) };
}

// a resolved pin as a typed port: a pin, or a terminal's UART (a transaction bus's, bytes); its level (V, null: not known)
const typed = p => port({ name: p.pin, dir: p.dir, kind: p.kind ?? 'pin', volts: p.volts ?? null, protocol: p.protocol ?? null });

// each node's typed ports, from its interfaces' resolved pins, each once, in their order
function nodePorts(nodes) {
  const out = {};
  for (const { n, ifaces } of nodes.values()) {
    const seen = new Map();
    for (const r of ifaces.values()) {
      const pins = [r.tx, r.rx, ...(r.pins || []), ...Object.values(r.spi || {}), ...Object.values(r.i2c || {})].filter(Boolean);
      for (const p of pins) if (!seen.has(p.pin)) seen.set(p.pin, typed(p));
    }
    out[n.id] = [...seen.values()];
  }
  return out;
}

// the nodes, each with its interfaces' pins resolved: Map(id → { n, board, ifaces: Map(name → { f, tx, rx, pins }) })
function checkNodes(sys, ctx, { err, warn }) {
  const nodes = new Map();
  for (const n of sys.nodes) {
    if (!n.id) { err(`A node (${n.kind || 'no kind'}) has no id`, node(n.id)); continue; }
    if (!isName(n.id)) { err(nodeIdError(n.id), node(n.id)); continue; }   // (#5446)
    if (nodes.has(lc(n.id))) { err(`Two nodes are named ${n.id}`, node(n.id)); continue; }
    if (!NODE_KINDS.includes(n.kind)) { err(`${n.id}: no node kind '${n.kind}' (the kinds: ${NODE_KINDS.join(', ')})`, node(n.id)); continue; }
    const at = { n, ifaces: new Map(), volts: null };
    nodes.set(lc(n.id), at);
    // (its board's USB id and serial number, #5489: one serial number one board)
    const usbWhy = usbError(n.usb);
    if (usbWhy) err(`${n.id}: ${usbWhy}`, node(n.id));
    const twin = n.usb?.serial && [...nodes.values()].find(o => o.n !== n && o.n.usb?.serial === n.usb.serial);
    if (twin) err(`${twin.n.id} and ${n.id} have the same USB serial number ${n.usb.serial}: one board is one node`, node(n.id));
    if (n.kind === 'fpga') checkFpga(n, at, ctx, { err, warn });
    else if (n.kind === 'mcu') checkMcu(n, at, ctx, { err, warn });
    else if (n.kind === 'circuit') checkCircuitFields(n, ctx, { err, warn });
    else if (n.kind === 'broker') checkBroker(n, at, { err });
    else if (n.kind === 'design') { if (n.interfaces.length) err(`${n.id}: a design node has no interfaces (its drawings are simulated, on no board)`, node(n.id)); }
    else for (const f of n.interfaces) {
      if (!checkInterface(n, f, at, { err, warn })) continue;
      if (f.kind !== 'uart') { err(`${n.id}: a serial terminal has UART interfaces only (${f.name} is ${f.kind})`, node(n.id)); continue; }
      at.ifaces.set(lc(f.name), { f, tx: { pin: `${f.name}.tx`, dir: 'out', kind: 'transaction', protocol: 'uart' }, rx: { pin: `${f.name}.rx`, dir: 'in', kind: 'transaction', protocol: 'uart' } });
    }
  }
  return nodes;
}

// an MQTT broker (#5500): one MQTT interface, which every client's link joins
function checkBroker(n, at, { err }) {
  if (n.interfaces.length !== 1 || n.interfaces[0].kind !== 'mqtt') { err(`${n.id}: an MQTT broker has one interface, an MQTT one, its clients' links' end`, node(n.id)); return; }
  if (checkInterface(n, n.interfaces[0], at, { err })) at.ifaces.set(lc(n.interfaces[0].name), { f: n.interfaces[0], mqtt: true });
}

// an interface's own fields: true when it can be resolved
function checkInterface(n, f, at, { err, warn }) {
  const ref = node(n.id);
  if (!f.name) { err(`${n.id}: an interface has no name`, ref); return false; }
  if (at.ifaces.has(lc(f.name))) { err(`${n.id}: two interfaces are named ${f.name}`, ref); return false; }
  if (f.kind === 'uart') {
    if (!Number.isInteger(f.baud) || f.baud <= 0) { err(`${n.id}.${f.name}: its baud '${f.baud ?? ''}' is not a rate (bits per second)`, ref); return false; }
    if (!BAUDS.includes(f.baud)) warn(`${n.id}.${f.name}: ${f.baud} baud is no standard rate (${BAUDS.join(', ')})`, ref);
    if (!FRAME_RE.test(String(f.frame ?? ''))) { err(`${n.id}.${f.name}: its frame '${f.frame ?? ''}' is not a frame (8N1: data bits 5 to 8, parity N, E or O, stop bits 1 or 2)`, ref); return false; }
    return true;
  }
  if (f.kind === 'gpio') {
    if (!f.pins.length) { err(`${n.id}.${f.name}: a GPIO interface with no pins`, ref); return false; }
    if (f.dir !== 'in' && f.dir !== 'out') { err(`${n.id}.${f.name}: its direction '${f.dir ?? ''}' is not in or out`, ref); return false; }
    return true;
  }
  if (f.kind === 'spi') {
    if (!(Number(f.hz) > 0)) { err(`${n.id}.${f.name}: its SCK rate '${f.hz ?? ''}' is not a rate (Hz)`, ref); return false; }
    if (![0, 1, 2, 3].includes(f.mode)) { err(`${n.id}.${f.name}: its mode '${f.mode ?? ''}' is not an SPI mode (0 to 3)`, ref); return false; }
    return true;
  }
  if (f.kind === 'i2c') {
    if (!(Number(f.hz) > 0)) { err(`${n.id}.${f.name}: its SCL rate '${f.hz ?? ''}' is not a rate (Hz)`, ref); return false; }
    return true;
  }
  if (f.kind === 'mqtt') return true;   // (#5500: its name only)
  err(`${n.id}.${f.name}: no interface kind '${f.kind}' (the kinds: ${INTERFACE_KINDS.join(', ')})`, ref);
  return false;
}

// an FPGA node: its module, its board, its ports' pins
function checkFpga(n, at, { modules, files, texts }, { err, warn }) {
  const ref = node(n.id);
  if (!n.module) err(`${n.id}: an FPGA node with no module`, ref);
  // (a Zynq board's processing system: its program, its board's PS, #4686)
  for (const p of psProblems(n, files ?? null)) err(p, ref);
  // (its PS–PL register map, #4688)
  for (const p of psMapProblems(n, files ?? null, texts ?? null)) err(p, ref);
  const entry = n.module && modules ? Object.entries(modules).find(([k]) => lc(k) === lc(n.module)) : null;
  const ports = entry?.[1] ?? null;   // (null: a module whose ports are not known, not elaborated: not checked)
  if (n.module && modules && !entry) err(`${n.id}: no module '${n.module}' in the project`, ref);
  const board = fpgaPins(n);
  if (!n.board) err(`${n.id}: an FPGA node with no board`, ref);
  else if (!board) err(`${n.id}: no FPGA board '${n.board}'${n.variant ? ` (variant ${n.variant})` : ''}`, ref);
  // its pins: each on its board, one port each
  const onPin = new Map();
  for (const [port, pin] of Object.entries(n.pins || {})) {
    const P = String(pin).toUpperCase();
    if (board && !board.pins.has(P)) err(`${n.id}: ${port}'s pin ${pin} is not a pin of the ${board.name}`, ref);
    if (onPin.has(P)) err(`${n.id}: ${onPin.get(P)} and ${port} are both on pin ${pin}`, ref);
    else onPin.set(P, port);
  }
  // a port of an interface: of the module, its direction, its pin
  const pinOf = (f, name, dir) => {
    const p = ports ? portOf(ports, name) : null;
    if (ports && !p) { err(`${n.id}.${f.name}: ${name} is no port of ${n.module}`, ref); return null; }
    if (p && p.dir !== 'inout' && p.dir !== dir) {
      const is = `an ${p.dir === 'in' ? 'input' : 'output'} of ${n.module}`;
      err(f.kind === 'uart' ? `${n.id}.${f.name}: its ${dir === 'out' ? 'TX' : 'RX'} ${name} is ${is}: TX and RX crossed?`
        : `${n.id}.${f.name}: ${name} is ${is}, the interface an ${dir === 'out' ? 'output' : 'input'}`, ref);
      return null;
    }
    // (a 1-bit port's pin by either spelling, x or x<0>, as a UCF may have it and the Board Emulator reads it, #5213)
    const alt = /<0>$/.test(name) ? name.slice(0, -3) : `${name}<0>`;
    const one = (p?.width ?? 1) === 1;
    const key = Object.keys(n.pins || {}).find(k => lc(k) === lc(name)) ?? (one ? Object.keys(n.pins || {}).find(k => lc(k) === lc(alt)) : undefined);
    if (key == null) { err(`${n.id}.${f.name}: ${name} has no pin of the board`, ref); return null; }
    const P = String(n.pins[key]).toUpperCase();
    return { pin: name, dir, loc: n.pins[key], volts: board?.pins.has(P) ? ioVolts(board.pins.get(P)) : null, std: board?.pins.get(P) || null, place: board?.labels.get(P) || null };
  };
  for (const f of n.interfaces) {
    if (!checkInterface(n, f, at, { err, warn })) continue;
    if (f.kind === 'uart' && f.ps) {
      // (a Zynq's PS UART, #4687: its board's MIO pins, which reach its USB serial port only; one a node)
      const ps = psOfBoard(n.board, n.variant);
      if (!ps) { err(`${n.id}.${f.name}: a PS UART, but its board ${n.board || '(none)'} has no processing system`, ref); continue; }
      if (f.tx || f.rx) { err(`${n.id}.${f.name}: a PS UART's pins are its board's MIO ${ps.uart.tx} (TX) and ${ps.uart.rx} (RX), not tx and rx ports`, ref); continue; }
      if (n.interfaces.find((i) => i.kind === 'uart' && i.ps) !== f) { err(`${n.id}.${f.name}: a second PS UART: its PS has one, UART${ps.uart.id}`, ref); continue; }
      const mio = (p, dir) => ({ pin: `MIO${p}`, dir, kind: 'transaction', protocol: 'uart' });
      at.ifaces.set(lc(f.name), { f, tx: mio(ps.uart.tx, 'out'), rx: mio(ps.uart.rx, 'in') });
    } else if (f.kind === 'uart') {
      if (!f.tx && !f.rx) { err(`${n.id}.${f.name}: a UART with no tx nor rx port`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, tx: f.tx ? pinOf(f, f.tx, 'out') : null, rx: f.rx ? pinOf(f, f.rx, 'in') : null });
    } else if (f.kind === 'spi') {
      // (the peripheral: SCK, MOSI and SS its inputs, MISO its output, #5214)
      const none = SPI_LINES.filter(k => !f[k]);
      if (none.length) { err(`${n.id}.${f.name}: an SPI bus with no ${none.join(', ')} port`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, spi: Object.fromEntries(SPI_LINES.map(k => [k, pinOf(f, f[k], k === 'miso' ? 'out' : 'in')])) });
    } else if (f.kind === 'i2c') {
      // (the peripheral: SCL its input, SDA an inout port, pulled low or released and read back, #5214)
      const none = I2C_LINES.filter(k => !f[k]);
      if (none.length) { err(`${n.id}.${f.name}: an I²C bus with no ${none.join(', ')} port`, ref); continue; }
      const sda = ports ? portOf(ports, f.sda) : null;
      if (sda && sda.dir !== 'inout') { err(`${n.id}.${f.name}: ${f.sda} is an ${sda.dir === 'in' ? 'input' : 'output'} of ${n.module}: an I²C bus's SDA is an inout port (pulled low or released, and read)`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, i2c: { scl: pinOf(f, f.scl, 'in'), sda: pinOf(f, f.sda, 'in') } });
    } else at.ifaces.set(lc(f.name), { f, pins: f.pins.map(p => pinOf(f, p, f.dir)) });
  }
}

// a microcontroller: its board, its firmware, its pins and UARTs the board's
function checkMcu(n, at, { files }, { err, warn }) {
  const ref = node(n.id);
  const b = mcuBoard(n.board);
  if (!n.board) err(`${n.id}: a microcontroller with no board`, ref);
  else if (!b) err(`${n.id}: no microcontroller board '${n.board}' (the boards: ${MCU_BOARDS.map(m => m.id).join(', ')})`, ref);
  // (a board of one language, the Pico's MicroPython, #5494)
  // (a Pico's Python firmware, #5697)
  if (n.runtime && b && !b.runtimes?.includes(n.runtime)) err(`${n.id}: ${b.runtimes ? `the ${b.name}'s firmware is ${b.runtimes.map(r => RUNTIME_NAMES[r]).join(' or ')}, not ${n.runtime}` : `the ${b.name} has no Python firmware to choose (runtime ${n.runtime})`}`, ref);
  if (b?.langs && n.lang && !b.langs.includes(n.lang)) err(`${n.id}: the ${b.name} runs ${b.langs.map(l => (l === 'micropython' ? 'MicroPython' : l)).join(' or ')}, not ${n.lang === 'cpp' ? 'C++' : n.lang === 'c' ? 'C' : n.lang}`, ref);
  if (n.firmware) {
    const exts = b?.firmwares ?? ['hex', 'elf'], ext = /\.([a-z0-9]+)$/i.exec(n.firmware)?.[1]?.toLowerCase();
    if (!exts.includes(ext)) err(`${n.id}: its firmware ${n.firmware} is not ${exts.map(e => (e === 'elf' ? 'an .elf' : `a .${e}`)).join(' or ')}${b?.arch === 'pic24' ? ' (XC16\'s Intel HEX)' : ''}`, ref);
    else if (files && !files.includes(n.firmware)) err(`${n.id}: no firmware ${n.firmware} in the project`, ref);
  }
  const has = p => !b || b.pins.includes(String(p).toUpperCase());
  const pin = (p, dir) => ({ pin: String(p).toUpperCase(), dir, volts: b?.vio ?? null });
  for (const f of n.interfaces) {
    if (!checkInterface(n, f, at, { err, warn })) continue;
    if (f.kind === 'uart') {
      if (!b) continue;   // (no board: said)
      const u = Object.entries(b.uarts).find(([k]) => lc(k) === lc(f.name))?.[1];
      if (!u) { err(`${n.id}: the ${b.name} has no UART ${f.name} (its UART: ${Object.keys(b.uarts).join(', ')})`, ref); continue; }
      const tx = String(f.tx ?? u.tx).toUpperCase(), rx = String(f.rx ?? u.rx).toUpperCase();
      if (tx === u.rx && rx === u.tx) { err(`${n.id}.${f.name}: TX and RX crossed: the ${b.name}'s TX is ${u.tx}, its RX ${u.rx}`, ref); continue; }
      if ((tx !== u.tx || rx !== u.rx)) { err(`${n.id}.${f.name}: the ${b.name}'s ${f.name} is TX ${u.tx}, RX ${u.rx}`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, tx: pin(tx, 'out'), rx: pin(rx, 'in') });
      continue;
    }
    if (f.kind === 'mqtt') {
      // (an MQTT client: a board with a network, #5500; a client with no broker said)
      if (b && !b.network) { err(`${n.id}.${f.name}: the ${b.name} has no network (an MQTT client is a Pico W's)`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, mqtt: true });
      continue;
    }
    if (f.kind === 'spi') {
      // (the master, on its board's SPI pins, #5214)
      if (!b) continue;
      const s = Object.entries(b.spis || {}).find(([k]) => lc(k) === lc(f.name))?.[1];
      if (!s) { err(`${n.id}: the ${b.name} has no SPI bus ${f.name} (its SPI: ${Object.keys(b.spis || {}).join(', ') || 'none'})`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, spi: Object.fromEntries(SPI_LINES.map(k => [k, pin(s[k], k === 'miso' ? 'in' : 'out')])) });
      continue;
    }
    if (f.kind === 'i2c') {
      // (the master, on its board's I²C pins, #5214)
      if (!b) continue;
      const s = Object.entries(b.i2cs || {}).find(([k]) => lc(k) === lc(f.name))?.[1];
      if (!s) { err(`${n.id}: the ${b.name} has no I²C bus ${f.name} (its I²C: ${Object.keys(b.i2cs || {}).join(', ') || 'none'})`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, i2c: { scl: pin(s.scl, 'out'), sda: pin(s.sda, 'out') } });
      continue;
    }
    const bad = f.pins.filter(p => !has(p));
    if (bad.length) { err(`${n.id}.${f.name}: ${bad.join(', ')} ${bad.length > 1 ? 'are not pins' : 'is not a pin'} of the ${b.name}`, ref); continue; }
    const inOnly = f.dir === 'out' && b?.inputOnly ? f.pins.filter(p => b.inputOnly.includes(String(p).toUpperCase())) : [];
    if (inOnly.length) { err(`${n.id}.${f.name}: ${inOnly.join(', ')} of the ${b.name} ${inOnly.length > 1 ? 'are inputs' : 'is an input'} only`, ref); continue; }
    at.ifaces.set(lc(f.name), { f, pins: f.pins.map(p => pin(p, f.dir)) });
  }
}

// a kind's name in a sentence: a GPIO link, an I²C link
const KIND_NAME = { uart: 'UART', gpio: 'GPIO', spi: 'SPI', i2c: 'I²C', mqtt: 'MQTT' };
const KIND_A = { uart: 'a', gpio: 'a', spi: 'an', i2c: 'an', mqtt: 'an' };

// the links: their ends, their settings, the wires they make; the nodes they reach
function checkLinks(sys, nodes, { err, warn }, wiresOut) {
  const ids = new Set(), byIface = new Map(), byPin = new Map(), used = new Set();
  for (const l of sys.links) {
    const ref = link(l.id);
    if (!l.id) { err(`A link (${l.a || '?'} to ${l.b || '?'}) has no id`, ref); continue; }
    if (ids.has(lc(l.id))) { err(`Two links are named ${l.id}`, ref); continue; }
    ids.add(lc(l.id));
    if (!LINK_KINDS.includes(l.kind)) { err(`${l.id}: no link kind '${l.kind}' (the kinds: ${LINK_KINDS.join(', ')})`, ref); continue; }
    const ends = [l.a, l.b].map(e => {
      const x = linkEnd(e);
      if (!x) { err(`${l.id}: its end '${e}' is not node.interface`, ref); return null; }
      const at = nodes.get(lc(x.node));
      if (!at) { err(`${l.id}: no node ${x.node}`, ref); return null; }
      used.add(lc(x.node));
      const f = at.n.interfaces.find(i => lc(i.name) === lc(x.iface));
      if (!f) { err(`${l.id}: ${x.node} has no interface ${x.iface}`, ref); return null; }
      if (f.kind !== l.kind) { err(`${l.id}: ${KIND_A[l.kind]} ${KIND_NAME[l.kind]} link, ${e} is ${f.kind === 'uart' ? 'a UART' : `${KIND_A[f.kind] ?? 'a'} ${KIND_NAME[f.kind] ?? String(f.kind).toUpperCase()} interface`}`, ref); return null; }
      const prev = at.n.kind !== 'broker' && byIface.get(`${lc(x.node)}.${lc(x.iface)}`);   // (a broker's: every client's)
      if (prev) { err(`${l.id}: ${e} is already ${prev}'s`, ref); return null; }
      byIface.set(`${lc(x.node)}.${lc(x.iface)}`, l.id);
      return { at, name: `${at.n.id}.${f.name}`, r: at.ifaces.get(lc(f.name)) };
    });
    if (ends.some(e => !e)) continue;
    const [a, b] = ends;
    if (a.at === b.at) { err(`${l.id}: both ends on ${a.at.n.id}: a link joins two nodes`, ref); continue; }
    if (!a.r || !b.r) continue;   // (an interface in error: said)
    // (a Zynq's PS UART, #4687: its board's USB serial port, a terminal's only; its Cortex-A9 not simulated, no wires)
    const psEnd = [a, b].find((e) => e.r.f?.ps);
    if (psEnd) {
      const other = psEnd === a ? b : a;
      if (other.at.n.kind !== 'terminal') { err(`${l.id}: ${psEnd.name} is its board's USB serial port: link it to a serial terminal (${other.name} is a ${other.at.n.kind} node's)`, ref); continue; }
      uartWires(l, a, b, { err });
      warn(`${l.id}: ${psEnd.name} is its PS's, whose Cortex-A9 is not simulated: Simulate and Emulate leave the link out (its terminal's Real Board reaches it)`, ref);
      continue;
    }
    // (an MQTT link: a client and its broker, #5500; messages, no wires)
    if (l.kind === 'mqtt') { if ((a.at.n.kind === 'broker') === (b.at.n.kind === 'broker')) err(`${l.id}: an MQTT link joins a client and a broker`, ref); continue; }
    const wires = l.kind === 'uart' ? uartWires(l, a, b, { err }) : l.kind === 'spi' ? spiWires(l, a, b, { err }) : l.kind === 'i2c' ? i2cWires(l, a, b, { err }) : gpioWires(l, a, b, { err });
    for (const [x, y, signal] of wires) {
      const said = [], level = { err, warn: (m, r) => { said.push(m); warn(m, r); } };
      checkWire(l, x, y, byPin, level);
      const [d, r] = y.dir === 'out' && x.dir !== 'out' ? [y, x] : [x, y];
      wiresOut.push({ link: l.id, kind: l.kind, signal, from: wireEnd(d), to: wireEnd(r), warnings: said });
    }
  }
  return used;
}

// a UART link's wires: a's TX to b's RX, b's TX to a's RX; the same baud and frame at both ends
function uartWires(l, a, b, { err }) {
  const ref = link(l.id);
  if (a.r.f.baud !== b.r.f.baud) err(`${l.id}: ${a.name} at ${a.r.f.baud} baud, ${b.name} at ${b.r.f.baud}: a UART's ends at one baud`, ref);
  if (String(a.r.f.frame).toUpperCase() !== String(b.r.f.frame).toUpperCase()) err(`${l.id}: ${a.name}'s frame ${a.r.f.frame}, ${b.name}'s ${b.r.f.frame}: a UART's ends with one frame`, ref);
  const w = [];
  if (a.r.tx && b.r.rx) w.push([{ end: a, ...a.r.tx }, { end: b, ...b.r.rx }, 'TX']);
  if (b.r.tx && a.r.rx) w.push([{ end: b, ...b.r.tx }, { end: a, ...a.r.rx }, 'TX']);
  return w;
}

// an SPI link's wires: the master's (a microcontroller's) SCK, MOSI and SS to the peripheral's (an FPGA's), its MISO back;
// one SCK rate and mode at both ends (#5214)
const SPI_LINES = ['sck', 'mosi', 'miso', 'ss'];
function spiWires(l, a, b, { err }) {
  const ref = link(l.id);
  const [m, p] = a.at.n.kind === 'mcu' ? [a, b] : [b, a];
  if (m.at.n.kind !== 'mcu' || p.at.n.kind !== 'fpga') { err(`${l.id}: an SPI link joins a microcontroller (the master) and an FPGA (the peripheral)`, ref); return []; }
  if (Number(m.r.f.hz) !== Number(p.r.f.hz)) err(`${l.id}: ${m.name}'s SCK at ${m.r.f.hz} Hz, ${p.name}'s at ${p.r.f.hz}: an SPI bus's ends at one rate`, ref);
  if (m.r.f.mode !== p.r.f.mode) err(`${l.id}: ${m.name} in mode ${m.r.f.mode}, ${p.name} in mode ${p.r.f.mode}: an SPI bus's ends in one mode`, ref);
  return SPI_LINES.map(k => (k === 'miso' ? [p.r.spi[k] && { end: p, ...p.r.spi[k] }, m.r.spi[k] && { end: m, ...m.r.spi[k] }, 'MISO'] : [m.r.spi[k] && { end: m, ...m.r.spi[k] }, p.r.spi[k] && { end: p, ...p.r.spi[k] }, k.toUpperCase()]))
    .filter(([x, y]) => x && y);
}

// an I²C link's wires: the master's (a microcontroller's) SCL and SDA to the peripheral's (an FPGA's), checked as the
// master's outputs (SDA: either end pulls it low, its levels the master's pull-up's); one SCL rate at both ends (#5214)
const I2C_LINES = ['scl', 'sda'];
function i2cWires(l, a, b, { err }) {
  const ref = link(l.id);
  const [m, p] = a.at.n.kind === 'mcu' ? [a, b] : [b, a];
  if (m.at.n.kind !== 'mcu' || p.at.n.kind !== 'fpga') { err(`${l.id}: an I²C link joins a microcontroller (the master) and an FPGA (the peripheral)`, ref); return []; }
  if (Number(m.r.f.hz) !== Number(p.r.f.hz)) err(`${l.id}: ${m.name}'s SCL at ${m.r.f.hz} Hz, ${p.name}'s at ${p.r.f.hz}: an I²C bus's ends at one rate`, ref);
  return I2C_LINES.map(k => [m.r.i2c[k] && { end: m, ...m.r.i2c[k] }, p.r.i2c[k] && { end: p, ...p.r.i2c[k] }, k.toUpperCase()]).filter(([x, y]) => x && y);
}

// a GPIO link's wires: its ends' pins in order, as many at each end
function gpioWires(l, a, b, { err }) {
  if (a.r.pins.length !== b.r.pins.length) { err(`${l.id}: ${a.name} has ${a.r.pins.length} pin(s), ${b.name} ${b.r.pins.length}: a GPIO link's ends have as many pins`, link(l.id)); return []; }
  return a.r.pins.map((p, i) => [p && { end: a, ...p }, b.r.pins[i] && { end: b, ...b.r.pins[i] }, String(i)]).filter(([x, y]) => x && y);
}

// a wire's end as the Wiring view shows it
const wireEnd = p => ({ node: p.end.at.n.id, pin: p.pin, loc: p.loc ?? null, dir: p.dir, kind: p.kind ?? 'pin', volts: p.volts ?? null, std: p.std ?? null, place: p.place ?? null });

const pinName = p => `${p.end.at.n.id}'s ${p.pin}${p.loc ? ` (pin ${p.loc})` : ''}`;

// a wire: each pin in one link, one driver, the levels
function checkWire(l, x, y, byPin, { err, warn }) {
  const ref = link(l.id);
  for (const p of [x, y]) {
    const key = `${lc(p.end.at.n.id)}:${lc(p.loc ?? p.pin)}`, prev = byPin.get(key);
    if (prev && prev !== l.id) err(`${pinName(p)} is used by two links, ${prev} and ${l.id}`, ref);
    else byPin.set(key, l.id);
  }
  if (x.dir === 'out' && y.dir === 'out') err(`${l.id}: ${pinName(x)} and ${pinName(y)} are both outputs: a wire driven twice`, ref);
  else if (x.dir === 'in' && y.dir === 'in') warn(`${l.id}: ${pinName(x)} and ${pinName(y)} are both inputs: nothing drives the wire`, ref);
  const [drv, rcv] = x.dir === 'out' ? [x, y] : [y, x];
  // (its ends as typed ports against its link's kind, #5485: the port kinds it joins)
  const why = drv.dir === 'out' && rcv.dir === 'in' ? endsProblem(l.kind, typed(drv), typed(rcv)) : null;
  if (why) err(`${l.id}: ${why}`, ref);
  // (a 5 V output on an FPGA's input, or on a 3.3 V microcontroller's: the PIC24's, #5484)
  const rk = rcv.end.at.n.kind;
  if (drv.dir === 'out' && rcv.dir === 'in' && drv.volts === 5 && (rk === 'fpga' || rk === 'mcu') && rcv.volts != null && rcv.volts < 5) {
    const of = rk === 'fpga' ? 'the FPGA' : `the ${mcuBoard(rcv.end.at.n.board)?.name ?? rcv.end.at.n.board}`;
    warn(`${l.id}: ${pinName(drv)}, a 5 V output, drives ${pinName(rcv)}, a ${rcv.volts} V input of ${of}${rcv.std ? ` (${rcv.std})` : ''}: a level shifter or a divider on the real boards`, ref);
  }
}

/** The check's lines as the console shows them, and its summary (Check System of `file`). */
export function systemCheckLines(file, diags) {
  const errors = diags.filter(d => d.severity === 'error'), warnings = diags.filter(d => d.severity === 'warning');
  const base = String(file).split('/').pop();
  return [...diags.map(d => `${d.severity === 'error' ? 'ERROR' : 'WARNING'}: ${d.message}`),
    errors.length ? `Process "Check System" of ${base} failed (${errors.length} error(s), ${warnings.length} warning(s)).`
      : `Process "Check System" of ${base} completed successfully${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`];
}

// a wire's end in a line: `uno D1`, `fpga rx (pin J3)`
const endText = e => `${e.node} ${e.pin}${e.loc ? ` (pin ${e.loc})` : ''}`;
/** The wires as the Wiring view shows them, a line each (#5216): `serial TX: uno D1 → fpga rx (pin J3), 5 V → 3.3 V`
 *  (its levels when its level warning said them), or "No wires" when no link resolves. */
export function wiringLines(wires) {
  if (!wires.length) return ['No wires: no link joins two resolved interfaces.'];
  return wires.map(w => `${w.link} ${w.signal}: ${endText(w.from)} → ${endText(w.to)}${w.warnings.length ? `, ${w.from.volts} V → ${w.to.volts} V` : ''}`);
}
