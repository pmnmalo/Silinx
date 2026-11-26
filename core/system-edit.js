// A System document's edits (#4700, docs/SYSTEMS.md): a node, an interface or a link added, changed or removed, as the
// System editor does them and the MCP server's edit_system (one set of rules and messages, #2674); a System described,
// as check_system says it before its check. Each edit takes the System and returns a new one ({ system, id }) or { error }: the System given
// is never changed. Isomorphic module (browser + Node).
import { NODE_KINDS, INTERFACE_KINDS, FRAME_RE, MCU_BOARDS, SPI_HZ, I2C_HZ, mcuBoard, linkEnd, normalizeSystem } from './system-doc.js';
import { isName } from './ident.js';
import { nodeLangs, langError, LANG_NAMES, relInNode, renamedPath } from './system-layout.js';
import { usbError } from './usb-id.js';
import { RUNTIME_NAMES } from './rp2040-firmware.js';

const lc = s => String(s).toLowerCase();
const copy = sys => normalizeSystem(JSON.parse(JSON.stringify(sys)));
/** A new UART interface's settings. */
export const UART_DEFAULTS = { baud: 9600, frame: '8N1' };
/** The node kinds' names, as the editor's Add menu and the MCP server say them. */
export const NODE_KIND_NAMES = { fpga: 'FPGA', mcu: 'Microcontroller', terminal: 'Serial terminal', circuit: 'Circuit', broker: 'MQTT broker' };

/** An id not used by a node or a link of the System: `base`, else base2, base3… */
export function freeId(sys, base) {
  const used = new Set([...sys.nodes, ...sys.links].map(x => lc(x.id)));
  if (!used.has(lc(base))) return base;
  let i = 2;
  while (used.has(lc(`${base}${i}`))) i++;
  return `${base}${i}`;
}

const nodeOf = (sys, id) => sys.nodes.find(n => n.id === id) || null;
const linkOf = (sys, id) => sys.links.find(l => l.id === id) || null;
const idError = (sys, id, self = null) => {
  if (!isName(id)) return `'${id}' is not an id: a letter, then letters, digits and _`;
  if ([...sys.nodes, ...sys.links].some(x => x !== self && lc(x.id) === lc(id))) return `the id '${id}' is used already`;
  return null;
};
// a node's file (its firmware, its circuit) outside its folder, said (#5488: a node's files in `<id>/`)
const outside = (id, what, f) => (f && relInNode(f, id) == null ? `${id}: its ${what} '${f}' is not in its folder ${id}/` : null);
// the links that reach a node's interface (or any of the node's: `iface` null)
const reaching = (sys, node, iface = null) => sys.links.filter(l => [l.a, l.b].some(e => { const x = linkEnd(e); return x?.node === node && (iface == null || x.iface === iface); }));

/**
 * A node added ({ kind, id?, board?, module?, lang?, runtime?, x?, y? }, lang its base language, its kind's default when not
 * given; runtime a Pico's Python firmware, #5697): an FPGA node with its module and board (no interface yet: its
 * ports are named in its UART's or GPIO's fields), a microcontroller with its board's UART (`Serial`), a serial terminal
 * with its UART (`serial`), a circuit (#5215) with its circuit (a .circ.json of the project; no interface: its boards'
 * pins are its links). Returns { system, id } or { error }.
 */
export function addNode(sys, { kind, id = null, board = null, module = null, circuit = null, lang = null, runtime = null, x = 0, y = 0 } = {}) {
  if (!NODE_KINDS.includes(kind)) return { error: `no node kind '${kind}': ${NODE_KINDS.join(', ')}` };
  if (lang != null && langError(kind, lang)) return { error: langError(kind, lang) };
  const out = copy(sys);
  const nid = id ?? freeId(out, kind === 'mcu' ? 'mcu' : kind === 'terminal' ? 'term' : kind === 'circuit' ? 'circuit' : kind === 'broker' ? 'broker' : 'fpga');
  const bad = idError(out, nid);
  if (bad) return { error: bad };
  let n;
  if (kind === 'fpga') n = { id: nid, kind, module, board: board ?? 'basys2', interfaces: [] };   // (its pins in its constraints file, #5581)
  else if (kind === 'mcu') {
    const b = mcuBoard(board ?? 'arduino-uno');
    if (!b) return { error: `no microcontroller board '${board}': ${MCU_BOARDS.map(m => m.id).join(', ')}` };
    // (a board of one language: in it, the Pico's MicroPython, #5494)
    if (b.langs && lang != null && !b.langs.includes(lang)) return { error: `the ${b.name} runs ${b.langs.join(', ')}, not ${lang}` };
    if (b.langs && lang == null) lang = b.langs[0];
    if (runtime && !b.runtimes?.includes(runtime)) return { error: b.runtimes ? `the ${b.name}'s firmware is ${b.runtimes.join(' or ')}, not ${runtime}` : `the ${b.name} has no Python firmware to choose` };
    // (a Pico W's network: its MQTT interface, #5500)
    n = { id: nid, kind, board: b.id, firmware: null, ...(runtime && runtime !== b.runtimes[0] ? { runtime } : {}), interfaces: [...Object.keys(b.uarts).map(name => ({ name, kind: 'uart', ...UART_DEFAULTS })), ...(b.network ? [{ name: 'mqtt', kind: 'mqtt' }] : [])] };
  } else if (kind === 'circuit') {
    const why = outside(nid, 'circuit', circuit);
    if (why) return { error: why };
    n = { id: nid, kind, circuit, interfaces: [] };
  }
  else if (kind === 'broker') n = { id: nid, kind, interfaces: [{ name: 'mqtt', kind: 'mqtt' }] };   // (#5500: every client's link's end)
  else n = { id: nid, kind, interfaces: [{ name: 'serial', kind: 'uart', ...UART_DEFAULTS }] };
  out.nodes.push({ ...n, ...(lang != null ? { lang } : {}), x: Math.round(+x || 0), y: Math.round(+y || 0) });
  return { system: normalizeSystem(out), id: nid };
}

// a link's end renamed ('old.iface' → 'new.iface', or the interface's name)
function renameEnds(sys, { node, to, iface = null, toIface = null }) {
  for (const l of sys.links) for (const k of ['a', 'b']) {
    const x = linkEnd(l[k]);
    if (!x || x.node !== node || (iface != null && x.iface !== iface)) continue;
    l[k] = `${to ?? x.node}.${toIface ?? x.iface}`;
  }
}

/**
 * A node's fields changed ({ id, board, module, variant, firmware, runtime, lang, usb, x, y, pins }: those given; a
 * Pico's runtime its Python firmware (#5697: 'micropython', its default, or 'circuitpython'); a firmware or a
 * circuit in the node's folder, renamed with it; `pins` merged, a port's pin
 * null or '' removing it; a variant or a firmware null removing it). Its id renamed in its links' ends too.
 */
export function changeNode(sys, id, fields = {}) {
  const out = copy(sys), n = nodeOf(out, id);
  if (!n) return { error: `no node '${id}' in the System` };
  const allowed = [...({ fpga: ['id', 'module', 'board', 'variant', 'pins', 'constraints', 'usb', 'x', 'y'], mcu: ['id', 'board', 'firmware', 'runtime', 'usb', 'x', 'y'], terminal: ['id', 'x', 'y'], circuit: ['id', 'circuit', 'spiHz', 'x', 'y'] }[n.kind] || ['id', 'x', 'y']),
    ...(nodeLangs(n.kind).length ? ['lang'] : [])];
  for (const k of Object.keys(fields)) if (!allowed.includes(k)) return { error: `${id}: a ${NODE_KIND_NAMES[n.kind] || n.kind} node has no field '${k}' (${allowed.join(', ')})` };
  if (fields.id != null && fields.id !== n.id) {
    const bad = idError(out, fields.id, n);
    if (bad) return { error: bad };
    renameEnds(out, { node: n.id, to: fields.id });
    // (its files with its folder, #5488)
    for (const k of ['firmware', 'circuit', 'constraints']) if (n[k]) n[k] = renamedPath(n[k], n.id, fields.id);
    n.id = fields.id;
  }
  if (n.kind === 'mcu' && fields.board != null) {
    const b = mcuBoard(fields.board);
    if (!b) return { error: `no microcontroller board '${fields.board}': ${MCU_BOARDS.map(m => m.id).join(', ')}` };
    // (its UART named as the old board's: the new board's, its links following; an Uno's Serial, an Explorer 16/32's
    // UART, #5484)
    const was = mcuBoard(n.board), ours = Object.keys(b.uarts);
    for (const f of n.interfaces) {
      if (f.kind !== 'uart' || !was?.uarts?.[f.name] || b.uarts[f.name] || ours.length !== 1 || n.interfaces.some(g => g.name === ours[0])) continue;
      renameEnds(out, { node: n.id, iface: f.name, toIface: ours[0] });
      f.name = ours[0];
    }
    n.board = b.id;
  } else if (fields.board !== undefined) n.board = fields.board || null;
  if (fields.module !== undefined) n.module = fields.module || null;
  // (its Python firmware, #5697: one of its board's, its first not written; another board's dropped with it)
  const runs = mcuBoard(n.board)?.runtimes;
  if (fields.runtime !== undefined) {
    const r = fields.runtime || null;
    if (r && !runs?.includes(r)) return { error: `${id}: ${runs ? `the ${mcuBoard(n.board).name}'s firmware is ${runs.join(' or ')}, not ${r}` : `the ${mcuBoard(n.board)?.name ?? n.board} has no Python firmware to choose`}` };
    if (!r || r === runs[0]) delete n.runtime; else n.runtime = r;
  } else if (n.runtime && !runs?.includes(n.runtime)) delete n.runtime;
  if (fields.lang !== undefined) {
    const why = langError(n.kind, fields.lang);
    if (why) return { error: `${id}: ${why}` };
    n.lang = fields.lang;
  }
  for (const k of ['firmware', 'circuit', 'constraints']) {
    if (fields[k] === undefined) continue;
    const why = outside(n.id, k, fields[k]);
    if (why) return { error: why };
    n[k] = fields[k] || null;
  }
  if (fields.variant !== undefined) { if (fields.variant == null || fields.variant === '') delete n.variant; else n.variant = String(fields.variant); }
  // (pins: set in its constraints file when the System is saved, #5581: core/system-constraints.js pinsToConstraints)
  if (fields.pins) { n.pins = { ...(n.pins || {}) }; for (const [port, pin] of Object.entries(fields.pins)) n.pins[port] = pin == null || pin === '' ? '' : String(pin).trim().toUpperCase(); }
  // (its board's USB id and serial number, #5489: the fields given merged, one null or '' removing it)
  if (fields.usb !== undefined) {
    const usb = fields.usb === null ? {} : { ...(n.usb || {}) };
    for (const [k, v] of Object.entries(fields.usb && typeof fields.usb === 'object' ? fields.usb : {})) { if (v == null || v === '') delete usb[k]; else usb[k] = v; }
    const why = fields.usb !== null && (typeof fields.usb !== 'object' || Array.isArray(fields.usb)) ? usbError(fields.usb) : usbError(usb);
    if (why) return { error: `${id}: ${why}` };
    if (Object.keys(usb).length) n.usb = usb; else delete n.usb;
  }
  // (a circuit node's SPI clock, #5384: its wires' latency a sixteenth of its period; null or '' the default's)
  if (fields.spiHz !== undefined) {
    const hz = Number(fields.spiHz);
    if (fields.spiHz == null || fields.spiHz === '') delete n.spiHz;
    else if (!(hz >= 1 && hz <= 100e6)) return { error: `${id}: its SPI clock is a frequency from 1 Hz to 100 MHz, not '${fields.spiHz}'` };
    else n.spiHz = hz;
  }
  for (const k of ['x', 'y']) if (fields[k] !== undefined) n[k] = Math.round(+fields[k] || 0);
  return { system: normalizeSystem(out), id: n.id };
}

/** A node removed, with the links that reach it. */
export function removeNode(sys, id) {
  const out = copy(sys);
  if (!nodeOf(out, id)) return { error: `no node '${id}' in the System` };
  const gone = new Set(reaching(out, id).map(l => l.id));
  out.nodes = out.nodes.filter(n => n.id !== id);
  out.links = out.links.filter(l => !gone.has(l.id));
  return { system: normalizeSystem(out), id };
}

// an interface's fields checked as they are set (the check says the rest: its pins on the board, its ports' directions)
function ifaceError(n, f) {
  if (!isName(f.name)) return `${n.id}: '${f.name}' is not an interface's name: a letter, then letters, digits and _`;
  if (!INTERFACE_KINDS.includes(f.kind)) return `${n.id}.${f.name}: no interface kind '${f.kind}': ${INTERFACE_KINDS.join(', ')}`;
  if (f.kind === 'uart') {
    if (!(Number.isInteger(f.baud) && f.baud > 0)) return `${n.id}.${f.name}: the baud is a whole number of bits a second, not '${f.baud}'`;
    if (!FRAME_RE.test(f.frame)) return `${n.id}.${f.name}: the frame is its data bits (5 to 8), its parity (N, E, O) and its stop bits (1, 2), as 8N1, not '${f.frame}'`;
  } else if (f.kind === 'spi') {
    if (!(Number(f.hz) > 0)) return `${n.id}.${f.name}: an SPI bus's SCK rate is a number of Hz, not '${f.hz}'`;
    if (![0, 1, 2, 3].includes(f.mode)) return `${n.id}.${f.name}: an SPI bus's mode is 0, 1, 2 or 3, not '${f.mode}'`;
  } else if (f.kind === 'i2c') {
    if (!(Number(f.hz) > 0)) return `${n.id}.${f.name}: an I²C bus's SCL rate is a number of Hz, not '${f.hz}'`;
  } else if (f.kind === 'mqtt') return null;
  else if (!['in', 'out'].includes(f.dir)) return `${n.id}.${f.name}: a GPIO's direction is in or out, not '${f.dir}'`;
  return null;
}

/**
 * An interface added to a node ({ name, kind: 'uart' | 'gpio' | 'spi' | 'i2c', … }): a UART with its tx and rx (an FPGA
 * node's ports), baud and frame (9600, 8N1 by default); GPIO with its pins and direction (in by default); an SPI bus
 * (#5214) with its SCK rate and mode (125 kHz, 0 by default), an FPGA node's its sck, mosi, miso and ss ports, a
 * microcontroller's its board's (SPI); an I²C bus with its SCL rate (100 kHz by default), an FPGA node's its scl and
 * sda ports, a microcontroller's its board's (Wire).
 */
export function addInterface(sys, id, f = {}) {
  const out = copy(sys), n = nodeOf(out, id);
  if (!n) return { error: `no node '${id}' in the System` };
  const kind = f.kind ?? 'uart';
  if (n.kind === 'mcu' && kind === 'uart') return { error: `${id}: a microcontroller's UARTs are its board's (${n.interfaces.filter(i => i.kind === 'uart').map(i => i.name).join(', ') || 'none'})` };
  if (n.kind === 'terminal') return { error: `${id}: a serial terminal has one UART, its own` };
  if (n.kind === 'broker') return { error: `${id}: an MQTT broker has one interface, its own` };
  if (kind === 'mqtt' && (n.kind !== 'mcu' || !mcuBoard(n.board)?.network)) return { error: `${id}: an MQTT interface is a network's: a Pico W's` };
  if (n.kind === 'circuit') return { error: `${id}: a circuit node has no interfaces: its boards' pins it wires are its links` };
  const spis = n.kind === 'mcu' ? Object.keys(mcuBoard(n.board)?.spis || {}) : null;
  if (kind === 'spi' && spis && !spis.some(s => lc(s) === lc(f.name ?? spis[0]))) return { error: `${id}: a microcontroller's SPI bus is its board's (${spis.join(', ') || 'none'})` };
  const i2cs = n.kind === 'mcu' ? Object.keys(mcuBoard(n.board)?.i2cs || {}) : null;
  if (kind === 'i2c' && i2cs && !i2cs.some(s => lc(s) === lc(f.name ?? i2cs[0]))) return { error: `${id}: a microcontroller's I²C bus is its board's (${i2cs.join(', ') || 'none'})` };
  const name = f.name ?? (kind === 'spi' && spis ? spis[0] : kind === 'i2c' && i2cs ? i2cs[0] : freeIfaceName(n, kind));
  const it = kind === 'uart' ? { name, kind, ...UART_DEFAULTS, ...pick(f, ['tx', 'rx', 'baud', 'frame']) }
    : kind === 'spi' ? { name, kind, ...(spis ? {} : pick(f, ['sck', 'mosi', 'miso', 'ss'])), hz: SPI_HZ, mode: 0, ...pick(f, ['hz', 'mode']) }
    : kind === 'i2c' ? { name, kind, ...(i2cs ? {} : pick(f, ['scl', 'sda'])), hz: I2C_HZ, ...pick(f, ['hz']) }
    : kind === 'mqtt' ? { name, kind }
      : { name, kind, pins: [], dir: 'in', ...pick(f, ['pins', 'dir']) };
  if (n.interfaces.some(i => lc(i.name) === lc(name))) return { error: `${id}: an interface named '${name}' is there already` };
  const bad = ifaceError(n, it);
  if (bad) return { error: bad };
  n.interfaces.push(it);
  return { system: normalizeSystem(out), id: `${id}.${name}` };
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
function freeIfaceName(n, kind) {
  const used = new Set(n.interfaces.map(i => lc(i.name)));
  let i = 1;
  while (used.has(`${kind}${i}`)) i++;
  return `${kind}${i}`;
}

/** An interface's fields changed ({ name, tx, rx, baud, frame, pins, dir }); its new name in its links' ends too. */
export function changeInterface(sys, id, name, fields = {}) {
  const out = copy(sys), n = nodeOf(out, id);
  if (!n) return { error: `no node '${id}' in the System` };
  const f = n.interfaces.find(i => i.name === name);
  if (!f) return { error: `${id}: no interface '${name}'` };
  const keys = f.kind === 'uart' ? (n.kind === 'fpga' ? ['name', 'tx', 'rx', 'baud', 'frame'] : ['baud', 'frame'])
    : f.kind === 'spi' ? (n.kind === 'fpga' ? ['name', 'sck', 'mosi', 'miso', 'ss', 'hz', 'mode'] : ['hz', 'mode'])
    : f.kind === 'i2c' ? (n.kind === 'fpga' ? ['name', 'scl', 'sda', 'hz'] : ['hz']) : ['name', 'pins', 'dir'];
  for (const k of Object.keys(fields)) if (!keys.includes(k)) return { error: `${id}.${name}: this interface has no field '${k}' to change (${keys.join(', ')})` };
  const next = { ...f, ...fields };
  if (fields.name != null && lc(fields.name) !== lc(name) && n.interfaces.some(i => lc(i.name) === lc(fields.name))) return { error: `${id}: an interface named '${fields.name}' is there already` };
  const bad = ifaceError(n, next);
  if (bad) return { error: bad };
  Object.assign(f, next);
  for (const k of ['tx', 'rx']) if (f[k] === '' || f[k] === null) delete f[k];
  if (next.name !== name) renameEnds(out, { node: id, iface: name, toIface: next.name });
  return { system: normalizeSystem(out), id: `${id}.${next.name}` };
}

/** An interface removed from a node, with the links that reach it (a microcontroller's and a terminal's UART are kept). */
export function removeInterface(sys, id, name) {
  const out = copy(sys), n = nodeOf(out, id);
  if (!n) return { error: `no node '${id}' in the System` };
  const f = n.interfaces.find(i => i.name === name);
  if (!f) return { error: `${id}: no interface '${name}'` };
  if (n.kind !== 'fpga' && f.kind === 'uart') return { error: `${id}.${name}: the ${n.kind === 'mcu' ? "board's" : "terminal's"} UART stays (remove the node instead)` };
  const gone = new Set(reaching(out, id, name).map(l => l.id));
  n.interfaces = n.interfaces.filter(i => i !== f);
  out.links = out.links.filter(l => !gone.has(l.id));
  return { system: normalizeSystem(out), id: `${id}.${name}` };
}

/**
 * A link added between two interfaces ({ a: 'node.iface', b, id? }): of their kind, two nodes, each end free (an
 * interface joins one link). Returns { system, id } or { error }.
 */
export function addLink(sys, { a, b, id = null } = {}) {
  const out = copy(sys);
  const ends = [a, b].map(e => { const x = linkEnd(e); const n = x && nodeOf(out, x.node); const f = n?.interfaces.find(i => i.name === x.iface); return { e, x, n, f }; });
  for (const { e, x, n, f } of ends) {
    if (!x) return { error: `'${e}' is not a link's end: node.interface` };
    if (!n) return { error: `no node '${x.node}' in the System` };
    if (!f) return { error: `${x.node}: no interface '${x.iface}'` };
    const other = n.kind !== 'broker' && reaching(out, x.node, x.iface)[0];   // (a broker's: every client's, #5500)
    if (other) return { error: `${e} is linked already (${other.id}): an interface joins one link` };
  }
  if (ends[0].n === ends[1].n) return { error: `a link joins two nodes: ${a} and ${b} are both of ${ends[0].n.id}` };
  if (ends[0].f.kind !== ends[1].f.kind) return { error: `${a} is ${kindText(ends[0].f.kind)}, ${b} is ${kindText(ends[1].f.kind)}: a link joins two interfaces of one kind` };
  if (ends[0].f.kind === 'mqtt' && (ends[0].n.kind === 'broker') === (ends[1].n.kind === 'broker')) return { error: `${a} and ${b}: an MQTT link joins a client and a broker` };
  const lid = id ?? freeId(out, { uart: 'serial', spi: 'spi', i2c: 'i2c', mqtt: 'mqtt' }[ends[0].f.kind] ?? 'wires');
  const bad = idError(out, lid);
  if (bad) return { error: bad };
  out.links.push({ id: lid, kind: ends[0].f.kind, a, b });
  return { system: normalizeSystem(out), id: lid };
}

/** A link's id changed ({ id }). */
export function changeLink(sys, id, fields = {}) {
  const out = copy(sys), l = linkOf(out, id);
  if (!l) return { error: `no link '${id}' in the System` };
  for (const k of Object.keys(fields)) if (k !== 'id') return { error: `${id}: a link has no field '${k}' to change (id; its ends: remove it and add another)` };
  if (fields.id != null && fields.id !== id) {
    const bad = idError(out, fields.id, l);
    if (bad) return { error: bad };
    l.id = fields.id;
  }
  return { system: normalizeSystem(out), id: l.id };
}

/** A link removed. */
export function removeLink(sys, id) {
  const out = copy(sys);
  if (!linkOf(out, id)) return { error: `no link '${id}' in the System` };
  out.links = out.links.filter(l => l.id !== id);
  return { system: normalizeSystem(out), id };
}

/** The MCP server's edit_system's actions, each an edit above. */
export const EDIT_ACTIONS = ['add_node', 'change_node', 'remove_node', 'add_interface', 'change_interface', 'remove_interface', 'add_link', 'change_link', 'remove_link'];

/** An edit by its action ({ action, node, interface, link, fields }, edit_system's arguments). */
export function editSystem(sys, { action, node = null, interface: iface = null, link = null, fields = {} } = {}) {
  const need = (v, what) => (v == null || v === '' ? { error: `${action}: which ${what}? (${what})` } : null);
  switch (action) {
    case 'add_node': return addNode(sys, fields);
    case 'change_node': return need(node, 'node') || changeNode(sys, node, fields);
    case 'remove_node': return need(node, 'node') || removeNode(sys, node);
    case 'add_interface': return need(node, 'node') || addInterface(sys, node, fields);
    case 'change_interface': return need(node, 'node') || need(iface, 'interface') || changeInterface(sys, node, iface, fields);
    case 'remove_interface': return need(node, 'node') || need(iface, 'interface') || removeInterface(sys, node, iface);
    case 'add_link': return addLink(sys, fields);
    case 'change_link': return need(link, 'link') || changeLink(sys, link, fields);
    case 'remove_link': return need(link, 'link') || removeLink(sys, link);
    default: return { error: `no action '${action}': ${EDIT_ACTIONS.join(', ')}` };
  }
}

// an interface's kind in a sentence
const kindText = k => ({ uart: 'a UART', gpio: 'GPIO', spi: 'an SPI bus', i2c: 'an I²C bus', mqtt: 'an MQTT interface' }[k] ?? k);

// an interface said in a few words
function ifaceText(n, f) {
  if (f.kind === 'gpio') return `${f.name}: GPIO ${f.dir}, ${f.pins.length ? f.pins.join(' ') : 'no pins'}`;
  if (f.kind === 'mqtt') return `${f.name}: MQTT`;   // (#5500)
  if (f.kind === 'spi') {
    const s = n.kind === 'mcu' ? mcuBoard(n.board)?.spis?.[f.name] : f;
    const at = k => `${k.toUpperCase()} ${s?.[k] ?? '?'}${n.kind === 'fpga' && n.pins?.[s?.[k]] ? ` (${n.pins[s[k]]})` : ''}`;
    return `${f.name}: SPI ${f.hz} Hz mode ${f.mode}, ${['sck', 'mosi', 'miso', 'ss'].map(at).join(', ')}`;
  }
  if (f.kind === 'i2c') {
    const s = n.kind === 'mcu' ? mcuBoard(n.board)?.i2cs?.[f.name] : f;
    const at = k => `${k.toUpperCase()} ${s?.[k] ?? '?'}${n.kind === 'fpga' && n.pins?.[s?.[k]] ? ` (${n.pins[s[k]]})` : ''}`;
    return `${f.name}: I²C ${f.hz} Hz, ${['scl', 'sda'].map(at).join(', ')}`;
  }
  const pins = n.kind === 'fpga' ? `, TX ${f.tx ?? '?'}${n.pins?.[f.tx] ? ` (${n.pins[f.tx]})` : ''}, RX ${f.rx ?? '?'}${n.pins?.[f.rx] ? ` (${n.pins[f.rx]})` : ''}`
    : n.kind === 'mcu' ? (b => (b?.uarts[f.name] ? `, TX ${b.uarts[f.name].tx}, RX ${b.uarts[f.name].rx}` : ''))(mcuBoard(n.board)) : '';
  return `${f.name}: UART ${f.baud} baud ${f.frame}${pins}`;
}

/** A System described, a line for each node (its kind, board, module or firmware, then its interfaces) and each link. */
export function describeSystem(sys) {
  const lines = [`System ${sys.name}: ${sys.nodes.length} node${sys.nodes.length === 1 ? '' : 's'}, ${sys.links.length} link${sys.links.length === 1 ? '' : 's'}`];
  for (const n of sys.nodes) {
    const what = n.kind === 'fpga' ? `FPGA, module ${n.module ?? '(none)'} on ${n.board ?? '(no board)'}${n.variant ? `-${n.variant}` : ''}`
      : n.kind === 'mcu' ? `${mcuBoard(n.board)?.name ?? n.board}, ${['rp2040', 'esp32'].includes(mcuBoard(n.board)?.arch) ? `${n.runtime ? `${RUNTIME_NAMES[n.runtime] ?? n.runtime}, ` : ''}program` : 'firmware'} ${n.firmware ?? '(none)'}` : n.kind === 'circuit' ? `circuit ${n.circuit ?? '(none)'}${n.spiHz ? `, its SPI clock ${n.spiHz} Hz` : ''}` : NODE_KIND_NAMES[n.kind] || n.kind;
    // (a CircuitPython node's language its firmware's, said, #5697)
    lines.push(`node ${n.id}: ${what}${n.lang && !n.runtime ? `, in ${LANG_NAMES[n.lang] ?? n.lang}` : ''}`);
    for (const f of n.interfaces) lines.push(`  ${ifaceText(n, f)}`);
  }
  for (const l of sys.links) lines.push(`link ${l.id}: ${l.kind === 'i2c' ? 'I²C' : String(l.kind).toUpperCase()} ${l.a} ↔ ${l.b}`);
  return lines;
}
