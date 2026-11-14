// A circuit's check (#3897, docs/CIRCUITS.md): its errors and warnings, as the console says them (the editor after
// every change and on Check, the MCP server's check_drawing), each pointing at its part or wire. Isomorphic module.
import { partDef, partPins } from './circuit-parts.js';
import { circuitNets, netSupply, netText } from './circuit-net.js';
import { portName } from './circuit.js';

const RESERVED = /^(abs|access|after|alias|all|and|architecture|array|assert|attribute|begin|block|body|buffer|bus|case|component|configuration|constant|disconnect|downto|else|elsif|end|entity|exit|file|for|function|generate|generic|group|guarded|if|impure|in|inertial|inout|is|label|library|linkage|literal|loop|map|mod|nand|new|next|nor|not|null|of|on|open|or|others|out|package|port|postponed|procedure|process|pure|range|record|register|reject|rem|report|return|rol|ror|select|severity|signal|shared|sla|sll|sra|srl|subtype|then|to|transport|type|unaffected|units|until|use|variable|wait|when|while|with|xnor|xor|always|assign|reg|wire|module|endmodule|input|output|initial|integer|parameter|posedge|negedge|default|endcase|begin|std_logic|ieee)$/i;

/** The circuit's problems: [{ severity: 'error' | 'warning', message, ref: { kind: 'part' | 'wire', id } }]. */
export function checkCircuit(m, nets = circuitNets(m)) {
  const out = [];
  const err = (message, ref) => out.push({ severity: 'error', message, ref });
  const warn = (message, ref) => out.push({ severity: 'warning', message, ref });
  const part = (id) => ({ kind: 'part', id });

  // the parts: their types, ids, labels
  const ids = new Map(), names = new Map();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(m.name) || RESERVED.test(m.name)) err(`The circuit's name '${m.name}' is not a valid HDL name`, null);
  for (const p of m.parts) {
    if (!partDef(p.type)) err(`${p.id}: no part '${p.type}' in the library`, part(p.id));
    if (!p.id) err(`A ${p.type} has no id`, part(p.id));
    else if (ids.has(p.id.toLowerCase())) err(`Two parts are named ${p.id}`, part(p.id));
    ids.set(p.id.toLowerCase(), p);
    const t = p.type;
    if (t === 'logic-switch' || t === 'button' || t === 'led') {
      const n = portName(p);
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(n) || /__|_$/.test(n) || RESERVED.test(n)) err(`${p.id}: its label '${n}' is not a valid HDL name`, part(p.id));
      else if (names.has(n.toLowerCase())) err(`${p.id}: its label '${n}' is ${names.get(n.toLowerCase())}'s too`, part(p.id));
      else if (n.toLowerCase() === m.name.toLowerCase()) err(`${p.id}: its label '${n}' is the circuit's name`, part(p.id));
      names.set(n.toLowerCase(), p.id);
    }
  }
  for (const w of m.wires) if (ids.has(w.id.toLowerCase())) err(`A wire and a part are both named ${w.id}`, { kind: 'wire', id: w.id });

  // two pins on one point (a hole holds one lead)
  for (const [k, s] of nets.at) {
    if (s.pins.length > 1) err(`${s.pins.map((q) => `${q.part} ${q.name}`).join(' and ')} are on the same ${s.holes.length ? `hole (${s.holes[0].name})` : 'point'} (${k})`, part(s.pins[1].part));
  }

  // the nets: shorts of the supply, outputs on a rail or on each other
  nets.nets.forEach((net) => {
    const sup = netSupply(net);
    const outs = net.pins.filter((q) => q.dir === 'out');
    const ref = net.pins[0] ? part(net.pins[0].part) : { kind: 'wire', id: net.wires[0] };
    if (sup.vcc && sup.gnd) err(`Short circuit: the supply's + and − are joined (${netText(net)})`, part(net.pins.find((q) => q.name === '+' || q.name === '-').part));
    else if ((sup.vcc || sup.gnd) && outs.length) err(`Short circuit: ${outs.map((q) => `${q.part} ${q.name}`).join(', ')} drive${outs.length > 1 ? '' : 's'} the supply's ${sup.vcc ? '+' : '−'} rail`, part(outs[0].part));
    else if (outs.length > 1) err(`Short circuit: ${outs.map((q) => `${q.part} ${q.name}`).join(' and ')} drive one net (a short whenever they differ)`, part(outs[1].part));
  });

  // what drives each net: a supply terminal, an output, a switch; or a button joining it to a driven net
  const driven = nets.nets.map((net) => net.pins.some((q) => q.dir === 'out' || ((q.dir === 'vcc' || q.dir === 'gnd') && (q.name === '+' || q.name === '-'))));
  const viaButton = new Map();
  for (const b of nets.buttons) {
    if (driven[b.a] && !driven[b.b]) viaButton.set(b.b, b.part);
    if (driven[b.b] && !driven[b.a]) viaButton.set(b.a, b.part);
    const sa = netSupply(nets.nets[b.a]), sb = netSupply(nets.nets[b.b]);
    if ((sa.vcc && sb.gnd) || (sa.gnd && sb.vcc)) err(`Short circuit while ${b.part} is pressed: it joins the supply's + and −`, part(b.part));
    else if (b.a !== b.b && driven[b.a] && driven[b.b]) err(`${b.part} joins two driven nets (${netText(nets.nets[b.a])}; ${netText(nets.nets[b.b])}): one of its sides must be driven by nothing else`, part(b.part));
  }

  for (const p of m.parts) {
    const d = partDef(p.type);
    if (!d) continue;
    const pins = partPins(p);
    const netOf = (n) => nets.nets[nets.pinNet.get(`${p.id}.${n}`)];
    if (d.kind === 'ic') {
      const vcc = netSupply(netOf(14)), gnd = netSupply(netOf(7));
      if (vcc.gnd && gnd.vcc) err(`${p.id} (${d.type}) is powered the wrong way round: its VCC (pin 14) on the supply's − and its GND (pin 7) on its +`, part(p.id));
      else if (!vcc.vcc || !gnd.gnd) err(`${p.id} (${d.type}) is not powered: ${[!vcc.vcc && 'its VCC (pin 14) is not on the supply\'s +', !gnd.gnd && 'its GND (pin 7) is not on the supply\'s −'].filter(Boolean).join(' and ')}`, part(p.id));
      // an input floating (a gate unused, its output joined to nothing, is the bench's habit: not warned)
      for (const g of d.gates) {
        if (netOf(g.out).pins.length < 2 && !netOf(g.out).wires.length) continue;
        for (const n of g.ins) {
          const k = nets.pinNet.get(`${p.id}.${n}`);
          if (driven[k]) continue;
          const q = pins.find((x) => x.n === n);
          const reads = d.family === 'ttl' ? 'a 74LS input reads high' : 'a CMOS input reads X';
          warn(viaButton.has(k) ? `${p.id} pin ${n} (${q.name}) floats while the button ${viaButton.get(k)} is released: ${reads}` : `${p.id} pin ${n} (${q.name}) is floating: ${reads}`, part(p.id));
        }
      }
    } else if (d.kind !== 'breadboard') {
      if (pins.every((q) => { const net = netOf(q.n); return net.pins.length < 2 && !net.wires.length; })) warn(`${p.id} (${d.title}) joins nothing`, part(p.id));
      else if (p.type === 'led') {
        const a = netOf(1), k = netOf(2), sa = netSupply(a), sk = netSupply(k);
        if (a === k) warn(`${p.id} never lights: its anode and its cathode are joined`, part(p.id));
        else if (sa.gnd || sk.vcc) warn(`${p.id} never lights: it is the wrong way round (${[sa.gnd && 'its anode on the supply\'s −', sk.vcc && 'its cathode on the supply\'s +'].filter(Boolean).join(', ')})`, part(p.id));
      }
    }
  }

  // a wire's end that joins nothing
  for (const w of m.wires) {
    for (const [i, q] of [w.points[0], w.points[w.points.length - 1]].entries()) {
      const s = nets.at.get(`${q[0]},${q[1]}`);
      if (s && !s.pins.length && !s.holes.length && s.ends.length < 2) warn(`The wire ${w.id}'s ${i ? 'end' : 'start'} (${q[0]},${q[1]}) joins nothing`, { kind: 'wire', id: w.id });
    }
  }
  return out;
}

/** The circuit's errors only (what keeps its HDL from being generated). */
export const circuitErrors = (m) => checkCircuit(m).filter((d) => d.severity === 'error');
