// The HDL generated from a circuit (#3897, #3899, docs/CIRCUITS.md): one module named after the circuit, its inputs (a
// switch's level, a button pressed, a DIP switch's levers, a clock) and its outputs (an LED lit, a display's segments,
// an LED bar's lights: '1' while lit); each net a resolved signal (std_logic, a Verilog wire), the supply's '1' and
// '0'; a pulled net (a pull-up or -down) its strong drivers' level, or the pull's while they leave it at 'Z' (written
// so, not as 'H' / 'L': the same in both languages); each IC an instance of its own entity (core/circuit-hdl-ics.js),
// written in the same file and named after the circuit (<circuit>_sn74ls00: two circuits of a project never define the
// same entity). A closed contact copies its driven side's net to its other side (one between two driven nets is an
// error of the check, core/circuit-check.js). Isomorphic module.
import { partDef } from './circuit-parts.js';
import { circuitNets } from './circuit-net.js';
import { normalizeCircuit, circuitPorts } from './circuit.js';
import { partInputs, partLamps } from './circuit-io.js';
import { circuitErrors } from './circuit-check.js';
import { pinPort, icPorts, vhdlIc, verilogIc } from './circuit-hdl-ics.js';

const entityOf = (m, d) => `${m.name}_${d.chip.toLowerCase()}`;
const isSupply = (q) => q.name === '+' || q.name === '-';
const WHILE = { level: 'on', momentary: 'pressed', clock: 'high' };

/** The circuit's HDL: { filename, code, module }, or an Error with its diagnostics when it has errors. */
export function generateCircuit(model, lang, { source } = {}) {
  const m = normalizeCircuit(model);
  lang = lang === 'verilog' || (!lang && m.lang === 'verilog') ? 'verilog' : 'vhdl';
  const errs = circuitErrors(m);
  if (errs.length) { const e = new Error(`The circuit '${m.name}' has ${errs.length} error(s):\n${errs.map((d) => `  - ${d.message}`).join('\n')}`); e.diagnostics = errs; throw e; }
  const V = lang === 'vhdl', c = V ? '--' : '//';
  const ports = circuitPorts(m);
  const plan = netPlan(m, V, ports);
  const types = [...new Set(m.parts.map((p) => partDef(p.type)).filter((d) => d?.kind === 'ic'))];

  const L = [];
  const rule = c + '='.repeat(78);
  L.push(rule, `${c} ${V ? 'Entity' : 'Module'}      : ${m.name}`, `${c} Description : the digital circuit ${source || `${m.name}.circ.json`}`);
  if (m.description) for (const line of m.description.split(/\r?\n/)) L.push(`${c}               ${line}`.trimEnd());
  L.push(`${c} Generator   : Silinx circuit editor (edit the circuit, not this file)`,
    `${c} Parts       : ${m.parts.filter((p) => partDef(p.type)?.kind === 'ic').map((p) => `${p.id} (${partDef(p.type).chip})`).join(', ') || 'no ICs'}`,
    `${c} Inputs      : ${ports.inputs.map((x) => `${x.name} (${x.part}, '1' while ${WHILE[x.kind]})`).join(', ') || 'none'}`,
    `${c} Outputs     : ${ports.outputs.map((x) => `${x.name} (${x.part}, '1' while lit)`).join(', ') || 'none'}`, rule, '');
  if (!V) L.push('`timescale 1ns / 1ps', '');
  for (const d of types) (V ? vhdlIc : verilogIc)(L, entityOf(m, d), d);

  // the circuit's module
  const ins = ports.inputs.map((x) => x.name), outs = ports.outputs.map((x) => x.name);
  const icMap = (p) => icPorts(partDef(p.type)).map((q) => [pinPort(q), plan.pinNet(p.id, q.n, q.dir)]);
  const lamps = m.parts.flatMap((p) => partLamps(p).map((x) => [x.port, plan.pinNet(p.id, x.a), plan.pinNet(p.id, x.k)]));
  if (V) {
    L.push('library ieee;', 'use ieee.std_logic_1164.all;', '', `entity ${m.name} is`);
    const ps = [...ins.map((n) => `${n} : in std_logic`), ...outs.map((n) => `${n} : out std_logic`)];
    if (ps.length) L.push('  port (', ps.map((x) => `    ${x}`).join(';\n'), '  );');
    L.push(`end entity ${m.name};`, '', `architecture circuit of ${m.name} is`);
    if (plan.signals.length) L.push(`  signal ${plan.signals.join(', ')} : std_logic := 'X';`);   // (unknown at first: no instant read as floating)
    if (plan.watched.length) L.push('  -- silinx: ignore unused-signal (watched by a logic probe)', `  signal ${plan.watched.join(', ')} : std_logic := 'X';`);
    L.push('begin');
    for (const [n, e, why] of plan.assigns) L.push(`  ${n} <= ${e};   -- ${why}`);
    for (const p of m.parts) if (plan.inst.has(p.id)) L.push(`  ${plan.inst.get(p.id)} : entity work.${entityOf(m, partDef(p.type))} port map (${icMap(p).map(([a, b]) => `${a} => ${b}`).join(', ')});`);
    for (const [o, a, k] of lamps) L.push(`  ${o} <= '1' when to_x01(${a}) = '1' and to_x01(${k}) = '0' else '0';`);
    L.push('end architecture circuit;');
  } else {
    L.push(`module ${m.name}${ins.length + outs.length ? ` (${[...ins.map((n) => `input ${n}`), ...outs.map((n) => `output ${n}`)].join(', ')})` : ''};`);
    if (plan.signals.length) L.push(`  wire ${plan.signals.join(', ')};`);
    if (plan.watched.length) L.push('  // silinx: ignore unused-signal (watched by a logic probe)', `  wire ${plan.watched.join(', ')};`);
    for (const [n, e, why] of plan.assigns) L.push(`  assign ${n} = ${e};   // ${why}`);
    for (const p of m.parts) if (plan.inst.has(p.id)) L.push(`  ${entityOf(m, partDef(p.type))} ${plan.inst.get(p.id)} (${icMap(p).map(([a, b]) => `.${a}(${b})`).join(', ')});`);
    for (const [o, a, k] of lamps) L.push(`  assign ${o} = (${a} === 1'b1) && (${k} === 1'b0);`);
    L.push('endmodule');
  }
  return { filename: `${m.name}.${V ? 'vhd' : 'v'}`, code: L.join('\n') + '\n', module: m.name, probes: plan.probes };
}

/**
 * The nets as signals: { signals, assigns: [[target, expression, comment]], inst: Map(part → instance name),
 * pinNet(part, pin, dir) → what a pin's port maps to }. A net is driven (the supply, an output, a switch, a pull) and read
 * (an input, an IC's power pin, a lamp, a contact from its driven side); a net nothing reads is no signal (an output
 * left open, the supply's rails unused), nor one of one pin and no wire (an input reading 'Z'). A pulled net n has its
 * strong drivers on n_d, and n is n_d, or the pull's level while n_d is 'Z'.
 */
function netPlan(m, V, ports) {
  const nets = circuitNets(m);
  const used = new Set([m.name, ...ports.inputs.map((x) => x.name), ...ports.outputs.map((x) => x.name)].map((s) => s.toLowerCase()));
  for (const d of m.parts.map((p) => partDef(p.type)).filter((d) => d?.kind === 'ic')) used.add(entityOf(m, d).toLowerCase());
  const fresh = (base) => { let s = base, k = 1; while (used.has(s.toLowerCase())) s = `${base}_${++k}`; used.add(s.toLowerCase()); return s; };
  const typeOf = new Map(m.parts.map((p) => [p.id, p.type]));
  const strong = nets.nets.map((net) => net.pins.some((q) => q.dir === 'out' || q.dir === 'oc' || isSupply(q)));
  const pulls = nets.nets.map((net) => [...new Set(net.pins.filter((q) => q.dir === 'weak').map((q) => partDef(typeOf.get(q.part)).pulls[0].value))]);
  const driven = strong.map((s, i) => s || pulls[i].length > 0);
  const read = nets.nets.map((net) => net.pins.some((q) => q.dir === 'in' || ((q.dir === 'vcc' || q.dir === 'gnd') && !isSupply(q))));
  // (a net a logic probe watches is a signal too, for the waveforms, #3900; one nothing else reads: watched only)
  const probed = nets.nets.map((net) => net.pins.some((q) => q.dir === 'probe'));
  // (a contact copies a strongly driven net to its other side, a pulled one's too: a pull-down and a button to +)
  const from = (k) => (strong[k.a] && !strong[k.b] ? k.a : strong[k.b] && !strong[k.a] ? k.b : !driven[k.a] && driven[k.b] ? k.b : driven[k.a] && !driven[k.b] ? k.a : null);
  for (const k of nets.contacts) { const f = from(k); if (f != null && read[f === k.a ? k.b : k.a]) read[f] = true; }
  const watchedOnly = probed.map((p, i) => p && !read[i]);
  probed.forEach((p, i) => { if (p) read[i] = true; });
  const name = [], drv = [];
  nets.nets.forEach((net, i) => {
    if (!read[i] || (net.pins.length === 1 && !net.wires.length)) return;
    name[i] = fresh(`n${name.filter(Boolean).length + 1}`);
    drv[i] = pulls[i].length ? fresh(`${name[i]}_d`) : name[i];
  });
  const inst = new Map(m.parts.filter((p) => partDef(p.type)?.kind === 'ic').map((p) => [p.id, fresh(`u_${p.id}`)]));
  const Z = V ? "'Z'" : "1'bz", lit = (v) => (V ? `'${v}'` : `1'b${v.toLowerCase()}`);
  const netOf = (id, n) => nets.pinNet.get(`${id}.${n}`);
  // (an output drives the net's strong side, an input reads the net)
  const isOut = (dir) => dir === 'out' || dir === 'oc';
  const pinNet = (id, n, dir = 'in') => { const i = netOf(id, n); return (isOut(dir) ? drv[i] : name[i]) ?? (isOut(dir) ? (V ? 'open' : '') : Z); };

  const assigns = [], targets = new Set();
  const add = (i, e, why) => { if (drv[i]) { assigns.push([drv[i], e, why]); targets.add(i); } };
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (!d) continue;
    if (d.kind === 'supply') { add(netOf(p.id, 1), lit('1'), `${p.id} +`); add(netOf(p.id, 2), lit('0'), `${p.id} −`); }
    const inputs = partInputs(p);
    for (const s of d.sources || []) add(netOf(p.id, s.pin), inputs[s.input].port, p.id);
    for (const ct of nets.contacts.filter((x) => x.part === p.id)) {
      const f = from(ct);   // (both strongly driven: an error of the check; neither driven: nothing to copy)
      if (f == null) continue;
      const to = f === ct.a ? ct.b : ct.a, port = inputs[ct.input].port;
      if (name[f]) add(to, V ? `${name[f]} when ${port} = '${ct.when ? 1 : 0}' else 'Z'` : `${ct.when ? port : `!${port}`} ? ${name[f]} : 1'bz`, `${p.id} ${p.type === 'button' ? 'pressed' : ct.when ? 'on' : 'off'}`);
    }
  }
  nets.nets.forEach((net, i) => {
    if (!name[i]) return;
    const icOut = net.pins.some((q) => isOut(q.dir) && partDef(typeOf.get(q.part))?.kind === 'ic');
    // a pulled net: its strong side's level, or the pull's (two pulls of opposite levels: X)
    if (pulls[i].length) {
      if (!targets.has(i) && !icOut) assigns.push([drv[i], Z, 'no strong driver']);
      const pv = pulls[i].length > 1 ? 'X' : pulls[i][0];
      assigns.push([name[i], V ? `${lit(pv)} when ${drv[i]} = 'Z' else ${drv[i]}` : `(${drv[i]} === 1'bz) ? ${lit(pv)} : ${drv[i]}`, `pulled ${pv === '1' ? 'up' : pv === '0' ? 'down' : 'both ways'}`]);
    } else if (!driven[i] && !targets.has(i)) assigns.push([name[i], Z, 'floating: a 74LS input reads it high, a 4000 input X']);
  });
  const watched = new Set(name.filter((n, i) => n && watchedOnly[i]));
  const signals = [...new Set([...name, ...drv].filter((n) => n && !watched.has(n)))];
  const probes = m.parts.filter((p) => p.type === 'probe').map((p) => ({ part: p.id, label: p.label || p.id, signal: name[netOf(p.id, 1)] ?? null }));
  return { signals, watched: [...watched], assigns, inst, pinNet, probes };
}
