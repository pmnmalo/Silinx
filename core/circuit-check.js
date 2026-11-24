// A circuit's check (#3897, #3899, docs/CIRCUITS.md): its errors and warnings, as the console says them (the editor
// after every change and on Check, the MCP server's check_drawing), each pointing at its part or wire. Isomorphic module.
import { partDef, partPins } from './circuit-parts.js';
import { circuitNets, netSupply, netText, isSupplyPin } from './circuit-net.js';
import { portName, partInputs, partLamps, busOf } from './circuit-io.js';
import { isName } from './ident.js';
import { reservedError } from './reserved.js';
import { checkModels } from './circuit-kicad-hdl.js';
import { keypadKey } from './circuit-keypad.js';

// a name of the HDL: an identifier (core/ident.js), not a reserved word of VHDL or Verilog (core/reserved.js), nor a
// name the generated VHDL uses itself
const badName = (n) => !isName(n) || !!reservedError(n) || /^(std_logic|ieee)$/i.test(n);
const isSupply = isSupplyPin;
const pinText = (q) => `${q.part} ${q.name}`;
const part = (id) => ({ kind: 'part', id });

/** The circuit's problems: [{ severity: 'error' | 'warning', message, ref: { kind: 'part' | 'wire', id } }]. */
// (`modules`: the project's, a KiCad part modelled by one of them checked against it, #4283; `runner`: their live models,
// one that cannot run in Try it said, #4284)
export function checkCircuit(m, nets = circuitNets(m), { modules = null, runner = null } = {}) {
  const out = [];
  const say = { err: (message, ref) => out.push({ severity: 'error', message, ref }), warn: (message, ref) => out.push({ severity: 'warning', message, ref }) };
  const ids = checkNames(m, say);
  for (const w of m.wires) if (ids.has(w.id.toLowerCase())) say.err(`A wire and a part are both named ${w.id}`, { kind: 'wire', id: w.id });
  // two pins on one point (a hole holds one lead)
  for (const [k, s] of nets.at) {
    if (s.pins.length > 1) say.err(`${s.pins.map(pinText).join(' and ')} are on the same ${s.holes.length ? `hole (${s.holes[0].name})` : 'point'} (${k})`, part(s.pins[1].part));
  }
  checkNets(nets, say);
  const driven = drivenNets(nets, m, say);
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (d?.kind === 'ic') checkIc(p, d, nets, driven, say);
    // (a project's KiCad part with no logic, #4280: drawn only)
    else if (d?.kind === 'model') continue;   // (checkModels, below)
    else if (d?.kind === 'drawn') say.warn(`${p.id} (${d.kicad.value}) is drawn only: it is not simulated and its pins drive nothing`, part(p.id));
    else if (d?.kind === 'lcd') checkLcd(p, d, nets, say);
    else if (d?.kind === 'servo') checkServo(p, d, nets, driven, say);
    else if (d?.kind === 'oled' || d?.kind === 'sensor') checkOled(p, d, nets, say, (id) => m.parts.find((x) => x.id === id)?.type);
    else if (d && d.kind !== 'breadboard') checkOther(p, d, nets, say);
  }
  checkModels(m.parts, partDef, modules, say, part, runner);
  // a wire's end that joins nothing
  for (const w of m.wires) {
    for (const [i, q] of [w.points[0], w.points[w.points.length - 1]].entries()) {
      const s = nets.at.get(`${q[0]},${q[1]}`);
      if (s && !s.pins.length && !s.holes.length && s.ends.length < 2) say.warn(`The wire ${w.id}'s ${i ? 'end' : 'start'} (${q[0]},${q[1]}) joins nothing`, { kind: 'wire', id: w.id });
    }
  }
  return out;
}

// the parts: their types, ids, labels and the HDL's names they make (a DIP switch's <label>_1…), each once
function checkNames(m, { err }) {
  const ids = new Map(), names = new Map(), buses = new Map();
  if (badName(m.name)) err(`The circuit's name '${m.name}' is not a valid HDL name`, null);
  for (const p of m.parts) {
    if (!partDef(p.type)) err(`${p.id}: no part '${p.type}' in the library`, part(p.id));
    if (!p.id) err(`A ${p.type} has no id`, part(p.id));
    else if (ids.has(p.id.toLowerCase())) err(`Two parts are named ${p.id}`, part(p.id));
    ids.set(p.id.toLowerCase(), p);
    const ports = [...partInputs(p), ...partLamps(p)].map((x) => x.port);
    if (!ports.length) continue;
    // (a bus's bit, led[0]: a single port's label, its base the name checked, #3901)
    const bus = busOf(portName(p));
    if (bus.bit != null && ports.length > 1) { err(`${p.id}: its label '${portName(p)}' is a bus's bit: a part of one port only (a switch, a button, a clock, an LED) has one`, part(p.id)); continue; }
    const n = bus.base;
    if (badName(n) || /__|_$/.test(n)) { err(`${p.id}: its label '${n}' is not a valid HDL name`, part(p.id)); continue; }
    if (n.toLowerCase() === m.name.toLowerCase()) err(`${p.id}: its label '${n}' is the circuit's name`, part(p.id));
    if (bus.bit != null) { const kind = partInputs(p).length ? 'in' : 'out'; (buses.get(n.toLowerCase()) ?? buses.set(n.toLowerCase(), { name: n, kind, bits: new Map() }).get(n.toLowerCase())).bits.set(bus.bit, { id: p.id, kind }); }
    const clash = ports.find((x) => names.has(x.toLowerCase()));
    if (clash) err(`${p.id}: its label '${n}' is ${names.get(clash.toLowerCase())}'s too${clash === n ? '' : ` (${clash})`}`, part(p.id));
    for (const x of ports) names.set(x.toLowerCase(), p.id);
  }
  // a bus: its bits 0 to its last, all inputs or all outputs, its name no scalar port's
  for (const b of buses.values()) {
    const ks = [...b.bits.keys()].sort((x, y) => x - y), first = b.bits.get(ks[0]);
    const gap = ks.findIndex((k, i) => k !== i);
    if (gap >= 0) err(`The bus ${b.name} has no bit ${gap} (its bits: ${ks.join(', ')}): its bits 0 to ${ks.at(-1)}, each a part's`, part(first.id));
    const mixed = [...b.bits.values()].find((x) => x.kind !== first.kind);
    if (mixed) err(`The bus ${b.name}: ${first.id} is an ${first.kind === 'in' ? 'input' : 'output'}, ${mixed.id} an ${mixed.kind === 'in' ? 'input' : 'output'}: a bus is one or the other`, part(mixed.id));
    if (names.has(b.name.toLowerCase())) err(`The bus ${b.name} is also ${names.get(b.name.toLowerCase())}'s port`, part(first.id));
  }
  return ids;
}

// the nets: shorts of the supply, outputs on a rail or on each other (open collector outputs on one net: a wired AND)
function checkNets(nets, { err, warn }) {
  nets.nets.forEach((net) => {
    const sup = netSupply(net);
    // (three-state outputs, #4409: several on one net a bus; with a plain output or a rail, a short while one is enabled)
    const tris = net.pins.filter((q) => q.tri), outs = net.pins.filter((q) => q.dir === 'out' && !q.tri), ocs = net.pins.filter((q) => q.dir === 'oc');
    if (tris.length && (outs.length || ocs.length || sup.vcc || sup.gnd)) warn(`${tris.map(pinText).join(', ')} (3-state) and ${[...outs, ...ocs].map(pinText).concat(sup.vcc ? ["the supply's +"] : sup.gnd ? ["the supply's −"] : []).join(', ')} drive one net: a short whenever ${tris.length > 1 ? 'one is' : 'it is'} enabled`, part(tris[0].part));
    if (sup.vcc && sup.gnd) err(`Short circuit: the supply's + and − are joined (${netText(net)})`, part(net.pins.find(isSupply).part));
    else if ((sup.vcc || sup.gnd) && outs.length) err(`Short circuit: ${outs.map(pinText).join(', ')} drive${outs.length > 1 ? '' : 's'} the supply's ${sup.vcc ? '+' : '−'} rail`, part(outs[0].part));
    else if (sup.vcc && ocs.length) err(`Short circuit: ${ocs.map(pinText).join(', ')} (open collector) on the supply's + rail: a short whenever ${ocs.length > 1 ? 'one is' : 'it is'} 0`, part(ocs[0].part));
    else if (outs.length > 1 || (outs.length && ocs.length)) err(`Short circuit: ${[...outs, ...ocs].map(pinText).join(' and ')} drive one net (a short whenever they differ)`, part([...outs, ...ocs][1].part));
    else if (ocs.length && !net.pins.some((q) => q.dir === 'weak') && net.pins.some((q) => q.dir === 'in')) {
      warn(`${ocs.map(pinText).join(', ')}: open collector with no pull-up: the net floats while ${ocs.length > 1 ? 'they are' : 'it is'} off (a 74LS input reads it high, an LED stays off)`, part(ocs[0].part));
    }
  });
}

// what drives each net (the supply, an output, a switch, a pull-up), and the nets a contact drives while closed (their
// floating inputs warned so); a contact across the supply, or between two strongly driven nets, an error (a pulled net
// is what a contact drives: a pull-down and a button to +)
function drivenNets(nets, m, { err }) {
  const strong = nets.nets.map((net) => net.pins.some((q) => q.dir === 'out' || q.dir === 'oc' || isSupply(q)));
  const driven = nets.nets.map((net, i) => strong[i] || net.pins.some((q) => q.dir === 'weak'));
  const via = new Map();
  const typeOf = new Map(m.parts.map((p) => [p.id, p.type]));
  for (const c of nets.contacts) {
    const how = typeOf.get(c.part) === 'button' ? 'pressed' : typeOf.get(c.part) === 'keypad-4x4' ? `pressed (its key ${keypadKey(c.input)})`
      : typeOf.get(c.part) === 'rotary-encoder' ? (c.input === 2 ? 'pressed (its switch)' : `turned (its ${'AB'[c.input]} contact closed)`) : c.when ? 'on' : 'off';   // (an encoder's, #5451)
    if (strong[c.a] && !driven[c.b]) via.set(c.b, c);
    if (strong[c.b] && !driven[c.a]) via.set(c.a, c);
    const sa = netSupply(nets.nets[c.a]), sb = netSupply(nets.nets[c.b]);
    if ((sa.vcc && sb.gnd) || (sa.gnd && sb.vcc)) err(`Short circuit while ${c.part} is ${how}: it joins the supply's + and −`, part(c.part));
    else if (c.a !== c.b && strong[c.a] && strong[c.b]) err(`${c.part} joins two driven nets while ${how} (${netText(nets.nets[c.a])}; ${netText(nets.nets[c.b])}): one of its sides must be driven by nothing else`, part(c.part));
  }
  return { driven, via, typeOf };
}

// an IC: powered by its VCC (VDD) and GND (VSS); its used gates' inputs floating (a gate unused, its output joined to
// nothing, is the bench's habit: not warned)
function checkIc(p, d, nets, { driven, via, typeOf }, { err, warn }) {
  const netOf = (n) => nets.nets[nets.pinNet.get(`${p.id}.${n}`)];
  const pv = d.pins.find((q) => q.dir === 'vcc'), pg = d.pins.find((q) => q.dir === 'gnd');
  const vcc = netSupply(netOf(pv.n)), gnd = netSupply(netOf(pg.n));
  const V = `its ${pv.name} (pin ${pv.n})`, G = `its ${pg.name} (pin ${pg.n})`;
  if (vcc.gnd && gnd.vcc) err(`${p.id} (${d.kicad?.value ?? d.type}) is powered the wrong way round: ${V} on the supply's − and ${G} on its +`, part(p.id));
  else if (!vcc.vcc || !gnd.gnd) err(`${p.id} (${d.kicad?.value ?? d.type}) is not powered: ${[!vcc.vcc && `${V} is not on the supply's +`, !gnd.gnd && `${G} is not on the supply's −`].filter(Boolean).join(' and ')}`, part(p.id));
  const pins = partPins(p);
  const reads = d.family === 'ttl' ? 'a 74LS input reads high' : 'a CMOS input reads X';
  // (an MSI IC's inputs all, once one of its outputs is used)
  const used = (n) => netOf(n).pins.length > 1 || netOf(n).wires.length > 0;
  const groups = d.gates || (d.pins.some((q) => (q.dir === 'out' || q.dir === 'oc') && used(q.n)) ? [{ ins: d.pins.filter((q) => q.dir === 'in').map((q) => q.n), out: null }] : []);
  for (const g of groups) {
    if (g.out != null && !used(g.out)) continue;
    for (const n of g.ins) {
      const k = nets.pinNet.get(`${p.id}.${n}`);
      if (driven[k]) continue;
      const q = pins.find((x) => x.n === n), c = via.get(k);
      const when = !c ? null : typeOf.get(c.part) === 'button' ? `the button ${c.part} is released` : typeOf.get(c.part) === 'keypad-4x4' ? `no key of ${c.part} is pressed`
        : typeOf.get(c.part) === 'rotary-encoder' ? (c.input === 2 ? `the switch of ${c.part} is released` : `the ${'AB'[c.input]} contact of ${c.part} is open`) : `${c.part} is ${c.when ? 'off' : 'on'}`;
      warn(when ? `${p.id} pin ${n} (${q.name}) floats while ${when}: ${reads}` : `${p.id} pin ${n} (${q.name}) is floating: ${reads}`, part(p.id));
    }
  }
}

// another part: one that joins nothing; an LED or a display that never lights (its anode and cathode joined, the wrong
// way round, a display's common on the wrong rail)
function checkOther(p, d, nets, { warn }) {
  const netOf = (n) => nets.nets[nets.pinNet.get(`${p.id}.${n}`)];
  // (a board's pins joined inside it, its GNDs, #5215: its own pins only)
  const alone = (net) => (d.kind === 'board' ? net.pins.every((q) => q.part === p.id) : net.pins.length < 2) && !net.wires.length;
  if (partPins(p).every((q) => alone(netOf(q.n)))) { warn(`${p.id} (${d.title}) joins nothing`, part(p.id)); return; }
  const base = d.kicad ? d.behaves : p.type;   // (a KiCad part behaving as the library's, #4349)
  if (base === 'led') {
    const a = netOf(1), k = netOf(2), sa = netSupply(a), sk = netSupply(k);
    if (a === k) warn(`${p.id} never lights: its anode and its cathode are joined`, part(p.id));
    else if (sa.gnd || sk.vcc) warn(`${p.id} never lights: it is the wrong way round (${[sa.gnd && 'its anode on the supply\'s −', sk.vcc && 'its cathode on the supply\'s +'].filter(Boolean).join(', ')})`, part(p.id));
  } else if (p.type === 'seg7-cc' || p.type === 'seg7-ca') {
    const com = netSupply(netOf(3)), cc = p.type === 'seg7-cc';
    if (cc ? com.vcc : com.gnd) warn(`${p.id} never lights: its common ${cc ? 'cathode is on the supply\'s + (a common anode display\'s place)' : 'anode is on the supply\'s − (a common cathode display\'s place)'}`, part(p.id));
  }
}

// a character LCD (#5330): joined to something; powered by its VDD and VSS (else it shows nothing); its RW low (its reads
// not simulated: tied to GND, as LiquidCrystal's wiring)
function checkLcd(p, d, nets, say) {
  const netOf = (name) => nets.nets[nets.pinNet.get(`${p.id}.${d.pins.find((q) => q.name === name).n}`)];
  if (partPins(p).every((q) => { const net = nets.nets[nets.pinNet.get(`${p.id}.${q.n}`)]; return net.pins.length < 2 && !net.wires.length; })) { say.warn(`${p.id} (${d.title}) joins nothing`, part(p.id)); return; }
  const vdd = netSupply(netOf('VDD')), vss = netSupply(netOf('VSS'));
  if (!vdd.vcc || !vss.gnd) say.warn(`${p.id} (${d.title}) is not powered: ${[!vdd.vcc && 'its VDD (pin 2) is not on the supply\'s +', !vss.gnd && 'its VSS (pin 1) is not on the supply\'s −'].filter(Boolean).join(' and ')}`, part(p.id));
  if (!netSupply(netOf('RW')).gnd) say.warn(`${p.id}'s RW (pin 5) is not on GND: its reads are not simulated (tie it low, as LiquidCrystal's wiring does)`, part(p.id));
}

// a graphic OLED on I²C (#5336): joined to something; powered by its VCC and GND; its SCL and SDA each pulled up (the
// bus's lines released high: a resistor to +5 V each, the module's own not drawn)
function checkOled(p, d, nets, say, typeOf) {
  const pinOf = (name) => d.pins.find((q) => q.name === name), netOf = (name) => nets.nets[nets.pinNet.get(`${p.id}.${pinOf(name).n}`)];
  if (partPins(p).every((q) => { const net = nets.nets[nets.pinNet.get(`${p.id}.${q.n}`)]; return net.pins.length < 2 && !net.wires.length; })) { say.warn(`${p.id} (${d.title}) joins nothing`, part(p.id)); return; }
  const vcc = netSupply(netOf('VCC')), gnd = netSupply(netOf('GND'));
  if (!vcc.vcc || !gnd.gnd) say.warn(`${p.id} (${d.title}) is not powered: ${[!vcc.vcc && `its VCC (pin ${pinOf('VCC').n}) is not on the supply's +`, !gnd.gnd && `its GND (pin ${pinOf('GND').n}) is not on the supply's −`].filter(Boolean).join(' and ')}`, part(p.id));
  const pulled = (name) => netOf(name).pins.some((q) => q.dir === 'weak' && partDef(typeOf(q.part))?.pulls?.[0]?.value === '1');
  for (const name of ['SCL', 'SDA']) {
    // (a line joined to something: an unused one is not a bus, #5342)
    if ((netOf(name).pins.length > 1 || netOf(name).wires.length) && !pulled(name)) say.warn(`${p.id}'s ${name} (pin ${pinOf(name).n}) has no pull-up: the I²C bus's lines are released high by a pull-up each`, part(p.id));
  }

}

// a servo (#5347): joined to something; powered by its VCC and GND; its signal driven (a board's pin is: its program's,
// its design's, in a System)
function checkServo(p, d, nets, { driven }, say) {
  const pinOf = (name) => d.pins.find((q) => q.name === name), at = (name) => nets.pinNet.get(`${p.id}.${pinOf(name).n}`), netOf = (name) => nets.nets[at(name)];
  if (partPins(p).every((q) => { const net = nets.nets[nets.pinNet.get(`${p.id}.${q.n}`)]; return net.pins.length < 2 && !net.wires.length; })) { say.warn(`${p.id} (${d.title}) joins nothing`, part(p.id)); return; }
  const vcc = netSupply(netOf('VCC')), gnd = netSupply(netOf('GND'));
  if (!vcc.vcc || !gnd.gnd) say.warn(`${p.id} (${d.title}) is not powered: ${[!vcc.vcc && `its VCC (pin ${pinOf('VCC').n}) is not on the supply's +`, !gnd.gnd && `its GND (pin ${pinOf('GND').n}) is not on the supply's −`].filter(Boolean).join(' and ')}`, part(p.id));
  if (!driven[at('SIG')] && !netOf('SIG').pins.some((q) => q.dir === 'board')) say.warn(`${p.id}'s signal (pin ${pinOf('SIG').n}) is driven by nothing: its arm stays where it is`, part(p.id));
}

/** The circuit's errors only (what keeps its HDL from being generated). */
export const circuitErrors = (m) => checkCircuit(m).filter((d) => d.severity === 'error');
