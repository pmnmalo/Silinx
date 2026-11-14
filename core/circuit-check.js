// A circuit's check (#3897, #3899, docs/CIRCUITS.md): its errors and warnings, as the console says them (the editor
// after every change and on Check, the MCP server's check_drawing), each pointing at its part or wire. Isomorphic module.
import { partDef, partPins } from './circuit-parts.js';
import { circuitNets, netSupply, netText } from './circuit-net.js';
import { portName, partInputs, partLamps } from './circuit-io.js';
import { isName } from './ident.js';
import { reservedError } from './reserved.js';

// a name of the HDL: an identifier (core/ident.js), not a reserved word of VHDL or Verilog (core/reserved.js), nor a
// name the generated VHDL uses itself
const badName = (n) => !isName(n) || !!reservedError(n) || /^(std_logic|ieee)$/i.test(n);
const isSupply = (q) => (q.dir === 'vcc' || q.dir === 'gnd') && (q.name === '+' || q.name === '-');
const pinText = (q) => `${q.part} ${q.name}`;
const part = (id) => ({ kind: 'part', id });

/** The circuit's problems: [{ severity: 'error' | 'warning', message, ref: { kind: 'part' | 'wire', id } }]. */
export function checkCircuit(m, nets = circuitNets(m)) {
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
    else if (d && d.kind !== 'breadboard') checkOther(p, d, nets, say);
  }
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
  const ids = new Map(), names = new Map();
  if (badName(m.name)) err(`The circuit's name '${m.name}' is not a valid HDL name`, null);
  for (const p of m.parts) {
    if (!partDef(p.type)) err(`${p.id}: no part '${p.type}' in the library`, part(p.id));
    if (!p.id) err(`A ${p.type} has no id`, part(p.id));
    else if (ids.has(p.id.toLowerCase())) err(`Two parts are named ${p.id}`, part(p.id));
    ids.set(p.id.toLowerCase(), p);
    const ports = [...partInputs(p), ...partLamps(p)].map((x) => x.port);
    if (!ports.length) continue;
    const n = portName(p);
    if (badName(n) || /__|_$/.test(n)) { err(`${p.id}: its label '${n}' is not a valid HDL name`, part(p.id)); continue; }
    if (n.toLowerCase() === m.name.toLowerCase()) err(`${p.id}: its label '${n}' is the circuit's name`, part(p.id));
    const clash = ports.find((x) => names.has(x.toLowerCase()));
    if (clash) err(`${p.id}: its label '${n}' is ${names.get(clash.toLowerCase())}'s too${clash === n ? '' : ` (${clash})`}`, part(p.id));
    for (const x of ports) names.set(x.toLowerCase(), p.id);
  }
  return ids;
}

// the nets: shorts of the supply, outputs on a rail or on each other (open collector outputs on one net: a wired AND)
function checkNets(nets, { err, warn }) {
  nets.nets.forEach((net) => {
    const sup = netSupply(net);
    const outs = net.pins.filter((q) => q.dir === 'out'), ocs = net.pins.filter((q) => q.dir === 'oc');
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
    const how = typeOf.get(c.part) === 'button' ? 'pressed' : c.when ? 'on' : 'off';
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
  if (vcc.gnd && gnd.vcc) err(`${p.id} (${d.type}) is powered the wrong way round: ${V} on the supply's − and ${G} on its +`, part(p.id));
  else if (!vcc.vcc || !gnd.gnd) err(`${p.id} (${d.type}) is not powered: ${[!vcc.vcc && `${V} is not on the supply's +`, !gnd.gnd && `${G} is not on the supply's −`].filter(Boolean).join(' and ')}`, part(p.id));
  const pins = partPins(p);
  const reads = d.family === 'ttl' ? 'a 74LS input reads high' : 'a CMOS input reads X';
  for (const g of d.gates) {
    if (netOf(g.out).pins.length < 2 && !netOf(g.out).wires.length) continue;
    for (const n of g.ins) {
      const k = nets.pinNet.get(`${p.id}.${n}`);
      if (driven[k]) continue;
      const q = pins.find((x) => x.n === n), c = via.get(k);
      const when = !c ? null : typeOf.get(c.part) === 'button' ? `the button ${c.part} is released` : `${c.part} is ${c.when ? 'off' : 'on'}`;
      warn(when ? `${p.id} pin ${n} (${q.name}) floats while ${when}: ${reads}` : `${p.id} pin ${n} (${q.name}) is floating: ${reads}`, part(p.id));
    }
  }
}

// another part: one that joins nothing; an LED or a display that never lights (its anode and cathode joined, the wrong
// way round, a display's common on the wrong rail)
function checkOther(p, d, nets, { warn }) {
  const netOf = (n) => nets.nets[nets.pinNet.get(`${p.id}.${n}`)];
  if (partPins(p).every((q) => { const net = netOf(q.n); return net.pins.length < 2 && !net.wires.length; })) { warn(`${p.id} (${d.title}) joins nothing`, part(p.id)); return; }
  if (p.type === 'led') {
    const a = netOf(1), k = netOf(2), sa = netSupply(a), sk = netSupply(k);
    if (a === k) warn(`${p.id} never lights: its anode and its cathode are joined`, part(p.id));
    else if (sa.gnd || sk.vcc) warn(`${p.id} never lights: it is the wrong way round (${[sa.gnd && 'its anode on the supply\'s −', sk.vcc && 'its cathode on the supply\'s +'].filter(Boolean).join(', ')})`, part(p.id));
  } else if (p.type === 'seg7-cc' || p.type === 'seg7-ca') {
    const com = netSupply(netOf(3)), cc = p.type === 'seg7-cc';
    if (cc ? com.vcc : com.gnd) warn(`${p.id} never lights: its common ${cc ? 'cathode is on the supply\'s + (a common anode display\'s place)' : 'anode is on the supply\'s − (a common cathode display\'s place)'}`, part(p.id));
  }
}

/** The circuit's errors only (what keeps its HDL from being generated). */
export const circuitErrors = (m) => checkCircuit(m).filter((d) => d.severity === 'error');
