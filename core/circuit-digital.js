// A circuit as synthesis reads it (#3901, docs/CIRCUITS.md): the digital model of its generated HDL, the body a synthesis
// tool builds when the circuit is an FPGA project's top (its simulation's model, core/circuit-hdl.js, behind
// `synthesis translate_off`, core/translate-off.js). Each net one expression: the supply's '1' or '0', a switch's port,
// a gate's output (the gates inlined, only those whose output is read), an MSI or sequential IC's output (an instance of
// its entity's digital architecture), open collector outputs ANDed (released: 1), a contact's source while it is
// closed, else the net's default (its pull's level; floating: 1 where a 74LS input reads it, 0 where only an LED does), a
// three-state output's level while it is enabled. No 'Z', no 'X', no delays,
// no power: a circuit with errors (a short, an unpowered IC) has no HDL. A lamp's port is its anode and not its cathode.
// Isomorphic module.
import { partDef } from './circuit-parts.js';
import { circuitNets } from './circuit-net.js';
import { partInputs, partLamps, portRef } from './circuit-io.js';
import { pinPort, icPorts } from './circuit-hdl-ics.js';

const isSupply = (q) => q.name === '+' || q.name === '-';
const OPS = { nand: ['and', true], and: ['and', false], or: ['or', false], nor: ['or', true], xor: ['xor', false] };

/** The top's digital body: { decl: [signals], body: [statements] } in VHDL (V) or Verilog; entityOf(d) an IC's entity. */
export function digitalTop(m, V, entityOf) {
  const nets = circuitNets(m);
  const typeOf = new Map(m.parts.map((p) => [p.id, p.type]));
  const netOf = (id, n) => nets.pinNet.get(`${id}.${n}`);
  const lit = (v) => (V ? `'${v}'` : `1'b${v}`);
  const not = (e) => (V ? `(not ${e})` : `~${e}`);
  const op = (o, xs) => `(${xs.join(V ? ` ${o} ` : ` ${{ and: '&', or: '|', xor: '^' }[o]} `)})`;
  // what drives each net: its gates (inlined), its MSI / sequential ICs' outputs, its sources, its contacts
  const gatesOut = new Map(), icOut = new Map(), sources = new Map(), contacts = new Map(), insts = [];
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (!d) continue;
    if (d.kind === 'supply') { sources.set(netOf(p.id, 1), lit('1')); sources.set(netOf(p.id, 2), lit('0')); }
    for (const s of d.sources || []) sources.set(netOf(p.id, s.pin), portRef(partInputs(p)[s.input].port, V));
    for (const g of d.gates || []) (gatesOut.get(netOf(p.id, g.out)) ?? gatesOut.set(netOf(p.id, g.out), []).get(netOf(p.id, g.out))).push({ p, d, g });
    // (an MSI or sequential IC; a KiCad part modelled by a module of the project, #4283)
    if (d.model || d.seq || d.kind === 'model') {
      const inst = { p, d, name: `d_${p.id}`, outs: new Map() };
      insts.push(inst);
      for (const q of d.pins.filter((x) => x.dir === 'out' || x.dir === 'oc')) (icOut.get(netOf(p.id, q.n)) ?? icOut.set(netOf(p.id, q.n), []).get(netOf(p.id, q.n))).push({ inst, q });
    }
  }
  const strong = nets.nets.map((net) => net.pins.some((q) => q.dir === 'out' || q.dir === 'oc' || isSupply(q)));
  for (const c of nets.contacts) {
    const from = strong[c.a] && !strong[c.b] ? c.a : strong[c.b] && !strong[c.a] ? c.b : null;
    if (from == null) continue;
    const to = from === c.a ? c.b : c.a, port = portRef(partInputs(m.parts.find((p) => p.id === c.part))[c.input].port, V);
    (contacts.get(to) ?? contacts.set(to, []).get(to)).push({ from, cond: V ? `${port} = '${c.when ? 1 : 0}'` : c.when ? port : not(port) });
  }
  // a net no one drives: its pull's level; else high where an IC's input reads it (a 74LS input, open: 1), low where only an
  // LED or a probe does (an LED on an open line: dark, as the engine shows it)
  const pullOf = (i) => {
    const w = nets.nets[i].pins.find((q) => q.dir === 'weak');
    if (w) return partDef(typeOf.get(w.part)).pulls[0].value;
    return nets.nets[i].pins.some((q) => q.dir === 'in' && partDef(typeOf.get(q.part))?.kind === 'ic') ? '1' : '0';
  };

  // the nets referenced, each a signal assigned its expression (a net read by nothing: none)
  const name = new Map(), queue = [];
  // (a net a switch or a clock drives: its port itself, no signal copying it, so that synthesis names the clock's net after
  // its port, as the constraints do)
  const ports = new Set(m.parts.flatMap((p) => (partDef(p.type)?.sources || []).map((x) => netOf(p.id, x.pin))));
  const ref = (i) => {
    if (ports.has(i)) return sources.get(i);
    if (!name.has(i)) { name.set(i, `n${name.size + 1}`); queue.push(i); }
    return name.get(i);
  };
  const gateExpr = ({ p, d, g }) => {
    const ins = g.ins.map((n) => ref(netOf(p.id, n)));
    if (g.fn === 'not') return not(ins[0]);
    const [o, inv] = OPS[g.fn];
    return inv ? not(op(o, ins)) : op(o, ins);
  };
  const exprOf = (i) => {
    if (sources.has(i)) return sources.get(i);
    const gs = gatesOut.get(i) || [], os = icOut.get(i) || [];
    const out = ({ inst, q }) => { const s = `${inst.name}_${pinPort(q)}`; inst.outs.set(q.n, s); return s; };
    // (a three-state output, a 74595's: its level while enabled, else the net's other drivers', else its default)
    const tri = os.filter(({ inst, q }) => inst.d.seq?.threeState?.outs.includes(pinPort(q)));
    const drivers = [...gs.map(gateExpr), ...os.filter((o) => !tri.includes(o)).map(out)];
    let rest = drivers.length ? (drivers.length === 1 ? drivers[0] : op('and', drivers)) : null;   // (open collectors on one net: a wired AND)
    if (tri.length) {
      rest ??= lit(pullOf(i));
      for (const o of tri.slice().reverse()) {
        const { enable, active } = o.inst.d.seq.threeState, en = ref(netOf(o.inst.p.id, o.inst.d.pins.find((x) => pinPort(x) === enable).n));
        rest = V ? `${out(o)} when ${en} = '${active}' else ${rest}` : `(${active === '1' ? en : not(en)} ? ${out(o)} : ${rest})`;
      }
    }
    if (rest) return rest;
    let e = lit(pullOf(i));
    for (const c of (contacts.get(i) || []).slice().reverse()) e = V ? `${ref(c.from)} when ${c.cond} else ${e}` : `(${c.cond} ? ${ref(c.from)} : ${e})`;
    return e;
  };
  // the lamps' ports and the MSI / sequential instances' inputs: what the circuit reads
  const lampLines = m.parts.flatMap((p) => partLamps(p).map((x) => {
    const a = ref(netOf(p.id, x.a)), k = ref(netOf(p.id, x.k)), o = portRef(x.port, V);
    return V ? `${o} <= ${a} and not ${k};` : `assign ${o} = ${a} & ~${k};`;
  }));
  // (a flip-flop's asynchronous control its circuit ties high, #3975: left out of its digital model, its generic false,
  // its port the constant; its supply's + or its net's default, nothing else driving it)
  const high = (i) => (sources.has(i) ? sources.get(i) === lit('1') : i != null && !gatesOut.has(i) && !icOut.has(i) && !contacts.has(i) && pullOf(i) === '1');
  for (const inst of insts) inst.unused = new Set((inst.d.controls || []).filter((c) => high(netOf(inst.p.id, inst.d.pins.find((q) => pinPort(q) === c.port).n))).map((c) => c.port));
  const instIns = insts.map((inst) => icPorts(inst.d).filter((q) => q.dir === 'in').map((q) => [pinPort(q), inst.unused.has(pinPort(q)) ? lit('1') : ref(netOf(inst.p.id, q.n))]));
  const supply = (inst) => (inst.d.kind === 'model' ? [] : [[pinPort(inst.d.pins.find((q) => q.dir === 'vcc')), lit('1')], [pinPort(inst.d.pins.find((q) => q.dir === 'gnd')), lit('0')]]);
  const assigns = [];
  while (queue.length) { const i = queue.shift(); assigns.push([name.get(i), exprOf(i)]); }
  const instOut = insts.flatMap((inst) => [...inst.outs.values()]);
  const sigs = [...name.values(), ...instOut];
  const instLines = insts.map((inst, k) => {
    const map = [...instIns[k], ...inst.d.pins.filter((q) => q.dir === 'out' || q.dir === 'oc').map((q) => [pinPort(q), inst.outs.get(q.n) ?? (V ? 'open' : '')]), ...supply(inst)];
    const gen = (inst.d.controls || []).map((c) => [c.generic, !inst.unused.has(c.port)]);
    const gmap = !gen.length ? '' : V ? `generic map (${gen.map(([g, u]) => `${g} => ${u}`).join(', ')}) ` : `#(${gen.map(([g, u]) => `.${g}(${u ? 1 : 0})`).join(', ')}) `;
    return V ? `${inst.name} : entity work.${entityOf(inst.d)} ${gmap}port map (${map.map(([a, b]) => `${a} => ${b}`).join(', ')});` : `${entityOf(inst.d)} ${gmap}${inst.name} (${map.map(([a, b]) => `.${a}(${b})`).join(', ')});`;
  });
  const decl = sigs.length ? [V ? `signal ${sigs.join(', ')} : std_logic;` : `wire ${sigs.join(', ')};`] : [];
  const body = [...assigns.map(([n, e]) => (V ? `${n} <= ${e};` : `assign ${n} = ${e};`)), ...instLines, ...lampLines];
  return { decl, body };
}
