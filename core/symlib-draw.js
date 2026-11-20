// The palette's compositions (#4806, core/symlib.js): how one is drawn. A composition is a small library of modules,
// each an ordinary schematic whose instances are the modules of the level below (ADD8: two ADD4; ADD4: four FA1; FA1:
// gates), so the schematic editor, the netlist and generateHdl work on them as on any drawing. A module's instances
// are drawn with the pins on the sides its library gives (an adder's carry in below it, its carry out above it), and a
// bus's bits are joined to it by their wires' names (A(7:4)), as ISE names them (#1688). Isomorphic (no DOM).
import { newDoc, normalizeDoc, symbolDef, symbolPins, joinOnWires, r10, instanceParams } from './schdoc.js';

const LIB_LANG = 'vhdl';   // (a composition's drawings: their HDL is generated in either language)

/** A library being built: its modules by name, each { name, ports: [{ name, dir, width, side }], symbol, doc } (symbol:
 *  its pins' sides, as a module's symbol file has them, core/symbol-layout.js). */
export function library() {
  const modules = new Map();
  return {
    modules,
    /** The module `name`, drawn by build() the first time: build returns { doc, sides: { pin: side } }. */
    use(name, build) {
      if (!modules.has(name)) {
        const { doc, sides = {} } = build();
        const ports = doc.ports.map(p => ({ name: p.name, dir: p.dir, width: p.width, side: sides[p.name] || (p.dir === 'out' ? 'E' : 'W') }));
        const symbol = { version: 1, kind: 'symbol', module: name, pins: ports.map(q => ({ name: q.name, side: q.side })), spacing: 20, width: null, height: null, title: 'center' };
        modules.set(name, { name, ports, symbol, doc: finish(doc) });
      }
      return modules.get(name);
    },
  };
}

// a drawing finished: its wires joined where they end on others, its sheet as large as its contents
function finish(doc) {
  joinOnWires(doc);
  const xs = [...doc.ports.map(p => p.x), ...doc.wires.flatMap(w => w.points.map(q => q.x))];
  const ys = [...doc.ports.map(p => p.y), ...doc.wires.flatMap(w => w.points.map(q => q.y))];
  doc.sheet.w = Math.max(doc.sheet.w, r10(Math.max(...xs) + 200));
  doc.sheet.h = Math.max(doc.sheet.h, r10(Math.max(...ys) + 160));
  return normalizeDoc(doc);
}

/** The instance parameters of a library module: its pins on their sides. */
const instParams = mod => ({ module: mod.name, generics: {}, ...instanceParams({ ports: mod.ports.map(({ side, ...q }) => q), symbol: mod.symbol }) });

/** A drawing being made, named `name`: its symbols, instances, wires, wires' names and markers. */
export function canvas(name, description = '') {
  const doc = newDoc(name, LIB_LANG);
  if (description) doc.description = description;
  const place = (type, params, x, y, label) => {
    const s = { id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: label || `XLXI_${doc.symbols.length + 1}`, params };
    doc.symbols.push(s);
    const pins = symbolPins(s);
    return { s, def: symbolDef(s), pin: n => { const q = pins.find(x => x.name === n); return { x: q.x, y: q.y }; } };
  };
  return {
    doc,
    sym: (type, params, x, y) => place(type, params, x, y),
    inst: (mod, x, y, label) => place('module', instParams(mod), x, y, label),
    wire(...pts) {
      const points = pts.filter((q, i) => !i || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y);
      if (points.length > 1) doc.wires.push({ id: `W${doc.wires.length + 1}`, points });
    },
    // (the name of the wire that ends at (x, y))
    label(net, x, y) { doc.labels.push({ id: `L${doc.labels.length + 1}`, x, y, net }); },
    marker(name, dir, width, x, y) { doc.ports.push({ id: `P${doc.ports.length + 1}`, name, dir, width, x, y }); },
  };
}

/** The local geometry of a library module's instance (its width, height, pins). */
export const instDef = mod => symbolDef({ type: 'module', x: 0, y: 0, rot: 0, mirror: false, params: instParams(mod) });

/** The name of bits msb..lsb of bus `bus` of `width` bits: the bus itself when they are all of it. */
export const bitsName = (bus, width, msb, lsb) => (msb === width - 1 && lsb === 0 ? bus : msb === lsb ? `${bus}(${msb})` : `${bus}(${msb}:${lsb})`);
