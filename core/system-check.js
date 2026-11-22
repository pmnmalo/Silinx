// A System document's check (#4697, docs/CODESIGN.md): its errors and warnings, as the console says them (the System
// editor on save, Check System, the MCP server's check_system), each pointing at its node or link. Isomorphic module.
//   error    a node's or a link's id missing or twice; a kind, a board, a module, a firmware unknown; an interface's
//            fields (its baud, its frame, its pins, its direction); an FPGA node's port that is no port of its module,
//            of the wrong direction (a TX that is an input: TX and RX crossed), with no pin or a pin not on its board,
//            two ports on one pin; a microcontroller's pin not on its board, its UART's TX and RX not the board's; a
//            link's end unknown, of another kind, the same node at both ends; the baud or the frame different at its
//            ends; GPIO widths different; a pin driven twice; a pin (an interface) used by two links
//   warning  a baud that is no standard rate; a GPIO wire nothing drives; a 5 V output on a 3.3 V FPGA's input; a node
//            that joins nothing
import { NODE_KINDS, LINK_KINDS, INTERFACE_KINDS, FRAME_RE, mcuBoard, linkEnd } from './system-doc.js';
import { resolveBoard } from './devices.js';
import { BAUDS } from './uart.js';

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
  const pins = new Map();
  for (const res of r.resources) for (const p of res.pins) pins.set(String(p).toUpperCase(), res.iostandard || '');
  return { name: r.board.name, pins };
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
export function checkSystem(sys, { modules = null, files = null } = {}) {
  const out = [];
  const say = { err: (message, ref) => out.push({ severity: 'error', message, ref }), warn: (message, ref) => out.push({ severity: 'warning', message, ref }) };
  const nodes = checkNodes(sys, { modules, files }, say);
  const used = checkLinks(sys, nodes, say);
  for (const n of sys.nodes) if (n.id && nodes.has(lc(n.id)) && !used.has(lc(n.id))) say.warn(`${n.id} joins nothing: no link reaches it`, node(n.id));
  return out;
}

// the nodes, each with its interfaces' pins resolved: Map(id → { n, board, ifaces: Map(name → { f, tx, rx, pins }) })
function checkNodes(sys, ctx, { err, warn }) {
  const nodes = new Map();
  for (const n of sys.nodes) {
    if (!n.id) { err(`A node (${n.kind || 'no kind'}) has no id`, node(n.id)); continue; }
    if (nodes.has(lc(n.id))) { err(`Two nodes are named ${n.id}`, node(n.id)); continue; }
    if (!NODE_KINDS.includes(n.kind)) { err(`${n.id}: no node kind '${n.kind}' (the kinds: ${NODE_KINDS.join(', ')})`, node(n.id)); continue; }
    const at = { n, ifaces: new Map(), volts: null };
    nodes.set(lc(n.id), at);
    if (n.kind === 'fpga') checkFpga(n, at, ctx, { err, warn });
    else if (n.kind === 'mcu') checkMcu(n, at, ctx, { err, warn });
    else for (const f of n.interfaces) {
      if (!checkInterface(n, f, at, { err, warn })) continue;
      if (f.kind !== 'uart') { err(`${n.id}: a serial terminal has UART interfaces only (${f.name} is ${f.kind})`, node(n.id)); continue; }
      at.ifaces.set(lc(f.name), { f, tx: { pin: `${f.name}.tx`, dir: 'out' }, rx: { pin: `${f.name}.rx`, dir: 'in' } });
    }
  }
  return nodes;
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
  err(`${n.id}.${f.name}: no interface kind '${f.kind}' (the kinds: ${INTERFACE_KINDS.join(', ')})`, ref);
  return false;
}

// an FPGA node: its module, its board, its ports' pins
function checkFpga(n, at, { modules }, { err, warn }) {
  const ref = node(n.id);
  if (!n.module) err(`${n.id}: an FPGA node with no module`, ref);
  const entry = n.module && modules ? Object.entries(modules).find(([k]) => lc(k) === lc(n.module)) : null;
  const ports = entry?.[1] ?? null;   // (null: a module whose ports are not known, not elaborated: not checked)
  if (n.module && modules && !entry) err(`${n.id}: no module '${n.module}' in the project`, ref);
  const board = fpgaPins(n);
  if (!n.board) err(`${n.id}: an FPGA node with no board`, ref);
  else if (!board) err(`${n.id}: no FPGA board '${n.board}'${n.variant ? ` (variant ${n.variant})` : ''}`, ref);
  // its pins: each on its board, one port each
  const onPin = new Map();
  for (const [port, pin] of Object.entries(n.pins)) {
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
    const key = Object.keys(n.pins).find(k => lc(k) === lc(name)) ?? (one ? Object.keys(n.pins).find(k => lc(k) === lc(alt)) : undefined);
    if (key == null) { err(`${n.id}.${f.name}: ${name} has no pin of the board`, ref); return null; }
    const P = String(n.pins[key]).toUpperCase();
    return { pin: name, dir, loc: n.pins[key], volts: board?.pins.has(P) ? ioVolts(board.pins.get(P)) : null, std: board?.pins.get(P) || null };
  };
  for (const f of n.interfaces) {
    if (!checkInterface(n, f, at, { err, warn })) continue;
    if (f.kind === 'uart') {
      if (!f.tx && !f.rx) { err(`${n.id}.${f.name}: a UART with no tx nor rx port`, ref); continue; }
      at.ifaces.set(lc(f.name), { f, tx: f.tx ? pinOf(f, f.tx, 'out') : null, rx: f.rx ? pinOf(f, f.rx, 'in') : null });
    } else at.ifaces.set(lc(f.name), { f, pins: f.pins.map(p => pinOf(f, p, f.dir)) });
  }
}

// a microcontroller: its board, its firmware, its pins and UARTs the board's
function checkMcu(n, at, { files }, { err, warn }) {
  const ref = node(n.id);
  const b = mcuBoard(n.board);
  if (!n.board) err(`${n.id}: a microcontroller with no board`, ref);
  else if (!b) err(`${n.id}: no microcontroller board '${n.board}' (the boards: arduino-uno, arduino-nano)`, ref);
  if (n.firmware) {
    if (!/\.(hex|elf)$/i.test(n.firmware)) err(`${n.id}: its firmware ${n.firmware} is not a .hex or an .elf`, ref);
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
    const bad = f.pins.filter(p => !has(p));
    if (bad.length) { err(`${n.id}.${f.name}: ${bad.join(', ')} ${bad.length > 1 ? 'are not pins' : 'is not a pin'} of the ${b.name}`, ref); continue; }
    const inOnly = f.dir === 'out' && b?.inputOnly ? f.pins.filter(p => b.inputOnly.includes(String(p).toUpperCase())) : [];
    if (inOnly.length) { err(`${n.id}.${f.name}: ${inOnly.join(', ')} of the ${b.name} ${inOnly.length > 1 ? 'are inputs' : 'is an input'} only`, ref); continue; }
    at.ifaces.set(lc(f.name), { f, pins: f.pins.map(p => pin(p, f.dir)) });
  }
}

// the links: their ends, their settings, the wires they make; the nodes they reach
function checkLinks(sys, nodes, { err, warn }) {
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
      if (f.kind !== l.kind) { err(`${l.id}: a ${l.kind.toUpperCase()} link, ${e} is ${f.kind === 'uart' ? 'a UART' : `a ${String(f.kind).toUpperCase()} interface`}`, ref); return null; }
      const prev = byIface.get(`${lc(x.node)}.${lc(x.iface)}`);
      if (prev) { err(`${l.id}: ${e} is already ${prev}'s`, ref); return null; }
      byIface.set(`${lc(x.node)}.${lc(x.iface)}`, l.id);
      return { at, name: `${at.n.id}.${f.name}`, r: at.ifaces.get(lc(f.name)) };
    });
    if (ends.some(e => !e)) continue;
    const [a, b] = ends;
    if (a.at === b.at) { err(`${l.id}: both ends on ${a.at.n.id}: a link joins two nodes`, ref); continue; }
    if (!a.r || !b.r) continue;   // (an interface in error: said)
    const wires = l.kind === 'uart' ? uartWires(l, a, b, { err }) : gpioWires(l, a, b, { err });
    for (const [x, y] of wires) checkWire(l, x, y, byPin, { err, warn });
  }
  return used;
}

// a UART link's wires: a's TX to b's RX, b's TX to a's RX; the same baud and frame at both ends
function uartWires(l, a, b, { err }) {
  const ref = link(l.id);
  if (a.r.f.baud !== b.r.f.baud) err(`${l.id}: ${a.name} at ${a.r.f.baud} baud, ${b.name} at ${b.r.f.baud}: a UART's ends at one baud`, ref);
  if (String(a.r.f.frame).toUpperCase() !== String(b.r.f.frame).toUpperCase()) err(`${l.id}: ${a.name}'s frame ${a.r.f.frame}, ${b.name}'s ${b.r.f.frame}: a UART's ends with one frame`, ref);
  const w = [];
  if (a.r.tx && b.r.rx) w.push([{ end: a, ...a.r.tx }, { end: b, ...b.r.rx }]);
  if (b.r.tx && a.r.rx) w.push([{ end: b, ...b.r.tx }, { end: a, ...a.r.rx }]);
  return w;
}

// a GPIO link's wires: its ends' pins in order, as many at each end
function gpioWires(l, a, b, { err }) {
  if (a.r.pins.length !== b.r.pins.length) { err(`${l.id}: ${a.name} has ${a.r.pins.length} pin(s), ${b.name} ${b.r.pins.length}: a GPIO link's ends have as many pins`, link(l.id)); return []; }
  return a.r.pins.map((p, i) => [p && { end: a, ...p }, b.r.pins[i] && { end: b, ...b.r.pins[i] }]).filter(([x, y]) => x && y);
}

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
  if (drv.dir === 'out' && rcv.dir === 'in' && drv.volts === 5 && rcv.end.at.n.kind === 'fpga' && rcv.volts != null && rcv.volts < 5) {
    warn(`${l.id}: ${pinName(drv)}, a 5 V output, drives ${pinName(rcv)}, a ${rcv.volts} V input of the FPGA${rcv.std ? ` (${rcv.std})` : ''}: a level shifter or a divider on the real boards`, ref);
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
