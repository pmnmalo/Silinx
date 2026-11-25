// Silinx toolchain - the Intel (Altera) FPGAs' constraints, QSF (#5376), as Quartus Prime reads them: a format of
// constraints.js's model.
//   set_location_assignment PIN_A8 -to LEDR[0]                                a port's pin
//   set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to LEDR[0]       its I/O standard (Quartus's names, as written)
//   set_instance_assignment -name WEAK_PULL_UP_RESISTOR ON -to KEY[0]         its weak pull-up
//   # create_clock -name {clk} -period 20.000 [get_ports {clk}]               a clock's period: Silinx's, in a comment (a QSF has
//                                                                             none: Quartus reads its clocks from an SDC, which
//                                                                             writeSdc writes from it)
// '#' starts a comment. The model's bits are written x<1> (UCF's), the QSF's x[1]. Any other assignment (set_global_assignment,
// another instance assignment, one with -from or -entity) is kept as it is (the model's `other`, for Quartus): a QSF is Tcl.
// A malformed location or I/O standard throws 'line N: …', where Quartus would stop.
import { byName, periodNs, setByName } from './ucf.js';
import { words } from './xdc.js';

const toModel = net => net.replace(/\[(\d+)\]$/, '<$1>');
const toQsf = net => net.replace(/<(\d+)>$/, '[$1]');
const num = x => (+x).toFixed(3);
const CLOCK = /^#\s*create_clock\s+(?:-name\s+\{?([^\s}]+)\}?\s+)?-period\s+([\d.]+)\s+(?:-waveform\s+\{([\d.\s]+)\}\s+)?\[get_ports\s+\{?([^\s}\]]+)\}?\]$/;
// (a value written quoted when it has a blank: "3.3-V LVTTL"; ON, PIN_A8 bare)
const quoted = v => (/[\s"{}[\]$;]/.test(v) ? `"${v}"` : v);

// the options of an assignment's words: { name, to, from, entity, value, rest }; null when it is malformed
function options(args) {
  const o = { rest: [] };
  for (let k = 0; k < args.length; k++) {
    const a = args[k].text;
    if (['-name', '-to', '-from', '-entity', '-section_id', '-tag'].includes(a) && args[k].kind === '') {
      if (k + 1 >= args.length) return null;
      o[a.slice(1)] = args[++k].text;
    } else o.rest.push(a);
  }
  return o;
}

// one assignment (its words): true when it is the model's, false to keep it as it is
function assignment(m, ws, fail) {
  const [cmd, ...args] = ws;
  if (cmd.text === 'set_location_assignment') {
    const o = options(args);
    if (!o || o.rest.length !== 1 || !o.to) fail('set_location_assignment needs a pin and -to <port>');
    if (o.from || o.entity || o.section_id) return false;
    const pin = o.rest[0].toUpperCase();
    if (!/^PIN_[A-Z]{1,2}\d{1,2}$/.test(pin)) fail(`set_location_assignment ${o.rest[0]}: a pin is PIN_<ball> (PIN_A8, PIN_AA12)`);
    setPort(m, o.to, { loc: pin });
    return true;
  }
  if (cmd.text === 'set_instance_assignment') {
    const o = options(args);
    if (!o || !o.name || !o.to || o.rest.length !== 1) fail('set_instance_assignment needs -name <assignment>, its value and -to <port>');
    if (o.from || o.entity || o.section_id || /[*?]/.test(o.to)) return false;
    const name = o.name.toUpperCase(), value = o.rest[0];
    if (name === 'IO_STANDARD') {
      if (!value.trim()) fail('IO_STANDARD needs a value ("3.3-V LVTTL", "2.5 V" …)');
      setPort(m, o.to, { iostandard: value });
      return true;
    }
    if (name === 'WEAK_PULL_UP_RESISTOR') {
      if (!/^(on|off)$/i.test(value)) fail(`WEAK_PULL_UP_RESISTOR ${value}: ON or OFF`);
      setPort(m, o.to, /^on$/i.test(value) ? { pull: 'up' } : {});
      return true;
    }
  }
  return false;
}

function setPort(m, net, attrs, line = m.line) {
  const n = toModel(net);
  m.netStatements.push({ net: n, attrs: { ...attrs }, line });
  setByName(m.assignments, n, { ...byName(m.assignments, n), ...attrs });
}

/** The model of a QSF text: { assignments, netStatements, clocks, other }. Throws 'line N: …' where Quartus would stop. */
export function readQsf(text) {
  const m = { assignments: {}, netStatements: [], clocks: [], other: [], line: 0 };
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const fail = msg => { throw new Error(`line ${i + 1}: ${msg}`); };
    const cmd = raw.trim();
    m.line = i + 1;
    const clock = CLOCK.exec(cmd);
    if (clock) {
      const [, name, p, wave, net] = clock, period = +p;
      if (!(period > 0)) fail('create_clock needs a period in ns');
      const [rise = 0, fall = period / 2] = (wave || '').trim().split(/\s+/).filter(Boolean).map(Number);
      m.clocks.push({ net: toModel(net), period, duty: +((100 * (fall - rise)) / period).toFixed(3), ...(name ? { name } : {}) });
      return;
    }
    if (!cmd || cmd.startsWith('#')) return;
    let ws;
    try { ws = words(cmd); } catch (e) { fail(e.message); }
    if (!assignment(m, ws, fail)) m.other.push(cmd);
  });
  delete m.line;
  return m;
}

// the bit names of the ports, as the model writes them: x<1>, a scalar x
function portBits(ports) {
  const bits = new Set();
  for (const p of ports) {
    const width = p.width || 1;
    if (width === 1 && (p.msb === null || p.msb === undefined)) { bits.add(p.name); continue; }
    const lo = Math.min(p.msb ?? width - 1, p.lsb ?? 0);
    for (let i = 0; i < width; i++) bits.add(`${p.name}<${lo + i}>`);
  }
  return bits;
}

// a pin's I/O standard: its own, else the board's for that pin (Quartus's default otherwise: 2.5 V on the Cyclone IV and V, a
// warning of the fitter's on a board at 3.3 V)
function iostandardOf(a, board) {
  if (a.iostandard) return a.iostandard;
  const loc = String(a.loc || '').toUpperCase();
  const r = board?.resources?.find(x => x.pins.some(p => String(p).toUpperCase() === loc));
  return r?.pinIostandards?.[loc] || r?.iostandard || null;
}

// the nets kept: all, or the ports' (the others in skipped, in order)
function keeper(ports) {
  const keep = ports ? portBits(ports) : null, skipped = [];
  const kept = net => {
    if (!keep || keep.has(net)) return true;
    if (!skipped.includes(net)) skipped.push(net);
    return false;
  };
  return { kept, skipped };
}
const headerLines = header => (header ? [...header.split('\n').map(h => `# ${h}`.trimEnd()), ''] : []);
const clockName = c => c.name || toQsf(c.net).replace(/\W/g, '_');

/**
 * The QSF of a constraints model ({ assignments, clocks, other? }: bits x<1>).
 *   ports   the ports the design keeps ([{ name, width, msb, lsb }]): the other nets are left out (skipped); none: all written
 *   board   the board (its resources' I/O standards, for a pin without one)
 *   header  the comment at the top
 * Returns { text, skipped }: skipped, the model's nets (pins and clocks) that are no port the design keeps, in order.
 */
export function writeQsf(model, { ports, board, header } = {}) {
  const { assignments = {}, clocks = [], other = [] } = model || {};
  const { kept, skipped } = keeper(ports);
  const lines = headerLines(header), pins = [];
  for (const [net, a] of Object.entries(assignments)) {
    if (!a || !kept(net)) continue;
    const to = toQsf(net), io = iostandardOf(a, board);
    if (a.loc) pins.push(`set_location_assignment ${String(a.loc).toUpperCase()} -to ${to}`);
    if (io) pins.push(`set_instance_assignment -name IO_STANDARD ${quoted(io)} -to ${to}`);
    if (a.pull === 'up') pins.push(`set_instance_assignment -name WEAK_PULL_UP_RESISTOR ON -to ${to}`);
  }
  lines.push(...pins);
  const clockLines = clocks.filter(c => kept(c.net)).map(c => `# create_clock -name {${clockName(c)}} -period ${num(periodNs(c.period))} [get_ports {${toQsf(c.net)}}]`);
  if (clockLines.length) lines.push(...(pins.length ? [''] : []), '# Timing constraints (Quartus reads them from the SDC Silinx writes)', ...clockLines);
  if (other.length) lines.push('', ...other);
  return { text: lines.length ? `${lines.join('\n').replace(/^\n+/, '')}\n` : '', skipped };
}

/**
 * The SDC of a constraints model's clocks, the timing constraints Quartus's TimeQuest reads: a create_clock per clock of a port
 * the design keeps, then the PLLs' clocks and the clocks' uncertainty derived. '' with no clock.
 */
export function writeSdc(model, { ports, header } = {}) {
  const { kept } = keeper(ports);
  const clocks = (model?.clocks || []).filter(c => kept(c.net));
  if (!clocks.length) return '';
  const lines = headerLines(header);
  for (const c of clocks) {
    const ns = periodNs(c.period), duty = c.duty ?? 50;
    lines.push(`create_clock -name {${clockName(c)}} -period ${num(ns)} -waveform {0.000 ${num((ns * duty) / 100)}} [get_ports {${toQsf(c.net)}}]`);
  }
  lines.push('derive_pll_clocks', 'derive_clock_uncertainty');
  return `${lines.join('\n')}\n`;
}

export const QSF = { id: 'qsf', read: text => readQsf(text), write: model => writeQsf(model).text };
