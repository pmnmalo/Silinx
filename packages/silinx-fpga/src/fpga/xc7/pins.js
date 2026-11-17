// Silinx toolchain - the 7-series' pins checked in the bitstream with no Vivado (#3145): each port's package pin, its
// direction and its IO standard, as the XDC and the netlist give them, against the IOBs the .bit's features (read back,
// readback.js framesToFeatures) configure; and no IOB configured that no port has.
// - packagePins: Project X-Ray's package_pins.csv as the bit database keeps it (research/xc7/build-db.mjs): a pin's IOB
//   tile and site (IOB_Y0 / IOB_Y1, as the site's Y is even or odd);
// - xdcPins: the ports' pins, standards and directions (the XDC's model, readXdc's, named as nextpnr names the ports);
// - ioConfig: the IOBs a .bit's features configure: their input and output buffers' standards (an IOB's features name
//   the standards that share their bits: LVCMOS25_LVCMOS33_LVTTL.IN);
// - checkPins: the two compared.
import { portBits, nextpnrNames } from '../../nextpnr-ports.js';

/** package_pins.csv's text: { pin: [tile, site] } for the pins of an IOB (not the transceivers', the configuration's). */
export function packagePins(csv) {
  const [head, ...rows] = String(csv).trim().split(/\r?\n/).map(l => l.split(','));
  const at = k => { const i = head.indexOf(k); if (i < 0) throw new Error(`package_pins.csv: no column ${k}`); return i; };
  const [pin, site, tile] = [at('pin'), at('site'), at('tile')];
  const out = {};
  for (const r of rows) {
    const m = /^IOB_X\d+Y(\d+)$/.exec(r[site]);
    if (m) out[r[pin]] = [r[tile], `IOB_Y${Number(m[1]) % 2}`];
  }
  return out;
}

/**
 * The pins the XDC gives the netlist's ports: [{ port, loc, iostandard, dir: 'input' | 'output' | 'inout' }], a port's
 * bits as nextpnr names them (a one-bit vector's btn[0] as btn), the IO standard LVCMOS33 when the XDC gives none (as
 * nextpnrXdc writes it); the ports with no PACKAGE_PIN left out (nextpnr places them anywhere, with its warning).
 */
export function xdcPins(model, netlistText, top) {
  const bits = portBits(netlistText, top);
  const bracketed = n => n.replace(/<(\d+)>$/, '[$1]');
  const named = nextpnrNames({ ...model, assignments: Object.fromEntries(Object.entries(model?.assignments || {}).map(([n, a]) => [bracketed(n), a])) }, bits);
  const mods = JSON.parse(netlistText).modules || {};
  const ports = (mods[top] || Object.values(mods).find(m => m.attributes?.top) || {}).ports || {};
  const dirOf = name => ports[name.replace(/\[\d+\]$/, '')]?.direction || ports[name]?.direction;
  return bits.filter(b => named.assignments[b.name]?.loc).map(b => {
    const a = named.assignments[b.name];
    return { port: b.name, loc: a.loc, iostandard: a.iostandard || 'LVCMOS33', dir: dirOf(b.name) };
  });
}

/**
 * The IOBs a .bit's features ([{ tile, key, zero }], framesToFeatures') configure: Map `${tile}.${site}` → { in, out }, each
 * the set of standards its input buffer's (an .IN feature) or its output driver's (a .DRIVE feature) features name, or
 * null when it has none. The features of no bit set (zero encodings) are not read, nor an unused IOB's STEPDOWN.
 */
export function ioConfig(features) {
  const out = new Map();
  for (const f of features) {
    if (f.zero || !/IOB33/.test(f.tile)) continue;
    const m = /^(IOB_Y[01])\.([A-Z0-9_]+)\.(IN|DRIVE)(?:\.|$)/.exec(f.key);
    if (!m) continue;
    const k = `${f.tile}.${m[1]}`, io = out.get(k) || { in: null, out: null }, side = m[3] === 'IN' ? 'in' : 'out';
    io[side] = new Set([...(io[side] || []), ...splitStandards(m[2])]);
    out.set(k, io);
  }
  return out;
}

// a feature's standards: LVCMOS25_LVCMOS33_LVTTL, LVDS_25, SSTL135, TMDS_33 (a standard's own _ followed by digits)
const splitStandards = s => s.split('_').reduce((a, w) => (/^\d+$/.test(w) && a.length ? [...a.slice(0, -1), `${a.at(-1)}_${w}`] : [...a, w]), []);

/**
 * The XDC's pins (xdcPins') against the IOBs the .bit configures (ioConfig's), on the part's pins (packagePins'): { ok,
 * checked: the pins checked, errors: [message] }. An input needs its IOB's input buffer, an output its driver (and an
 * input no driver, an output no input buffer); either of the XDC's standard; and every IOB the .bit configures is a port's.
 */
export function checkPins(pins, expected, io) {
  const errors = [], mine = new Set();
  for (const p of expected) {
    const at = pins[p.loc];
    if (!at) { errors.push(`${p.port}: the pin ${p.loc} is not one of the package's IOBs`); continue; }
    const k = `${at[0]}.${at[1]}`, c = io.get(k) || { in: null, out: null }, what = `${p.port} (${p.loc}, ${k})`;
    mine.add(k);
    const wantIn = p.dir !== 'output', wantOut = p.dir !== 'input';
    for (const [side, want, name] of [['in', wantIn, 'input buffer'], ['out', wantOut, 'output driver']]) {
      if (want && !c[side]) errors.push(`${what}: an ${p.dir} with no ${name} in the .bit`);
      else if (!want && c[side]) errors.push(`${what}: an ${p.dir} with an ${name} in the .bit`);
      else if (want && !c[side].has(p.iostandard)) errors.push(`${what}: ${p.iostandard} in the XDC, the .bit's ${name} ${[...c[side]].join(' / ')}`);
    }
  }
  const byIob = Object.fromEntries(Object.entries(pins).map(([pin, [t, s]]) => [`${t}.${s}`, pin]));
  for (const k of [...io.keys()].sort()) if (!mine.has(k)) errors.push(`${k}${byIob[k] ? ` (${byIob[k]})` : ''}: an IOB the .bit configures, no port's in the XDC`);
  return { ok: !errors.length, checked: expected.length, errors };
}
