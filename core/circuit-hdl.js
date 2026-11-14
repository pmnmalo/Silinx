// The HDL generated from a circuit (#3897, docs/CIRCUITS.md): one module named after the circuit, its logic switches and
// buttons its inputs ('1' while on or pressed), its LEDs its outputs ('1' while lit); each net a resolved signal
// (std_logic, a Verilog wire), the supply's '1' and '0'; each IC an instance of its own entity, written in the same file
// and named after the circuit (<circuit>_sn74ls00: two circuits of a project never define the same entity), its gates
// with their delays (inertial, as core/circuit-sim.js's) and its inputs read as the real chip reads them (a floating
// 74LS input high), driving nothing while unpowered. A pressed button copies its driven side's net to its other side
// (one between two driven nets is an error of the check, core/circuit-check.js). Isomorphic module.
import { partDef } from './circuit-parts.js';
import { circuitNets } from './circuit-net.js';
import { normalizeCircuit, circuitPorts, portName } from './circuit.js';
import { circuitErrors } from './circuit-check.js';

const entityOf = (m, d) => `${m.name}_${d.chip.toLowerCase()}`;
// a pin's port name: 1A → a1, 2Y → y2, VCC → vcc
const pinPort = (p) => (/^\d/.test(p.name) ? `${p.name.slice(1).toLowerCase()}${p.name[0]}` : p.name.toLowerCase());

/** The circuit's HDL: { filename, code, module }, or an Error with its diagnostics when it has errors. */
export function generateCircuit(model, lang, { source } = {}) {
  const m = normalizeCircuit(model);
  lang = lang === 'verilog' || (!lang && m.lang === 'verilog') ? 'verilog' : 'vhdl';
  const errs = circuitErrors(m);
  if (errs.length) { const e = new Error(`The circuit '${m.name}' has ${errs.length} error(s):\n${errs.map((d) => `  - ${d.message}`).join('\n')}`); e.diagnostics = errs; throw e; }
  const nets = circuitNets(m);
  const V = lang === 'vhdl', c = V ? '--' : '//';
  const ports = circuitPorts(m);

  // the names: the ports', then the nets' and the instances', made unique against them
  const used = new Set([m.name, ...ports.inputs.map((x) => x.name), ...ports.outputs.map((x) => x.name)].map((s) => s.toLowerCase()));
  const fresh = (base) => { let s = base, k = 1; while (used.has(s.toLowerCase())) s = `${base}_${++k}`; used.add(s.toLowerCase()); return s; };
  const types = [...new Set(m.parts.map((p) => partDef(p.type)).filter((d) => d?.kind === 'ic'))];
  for (const d of types) used.add(entityOf(m, d).toLowerCase());
  // which nets are driven (the supply, a switch, an IC's output) and read (an IC's input or power pin, an LED, a button
  // from its driven side to an undriven one); a net nothing reads is no signal (an output left open, the supply's rails
  // unused), nor one of one pin and no wire (an input reading 'Z': a floating 74LS input, high)
  const driven = nets.nets.map((net) => net.pins.some((q) => q.dir === 'out' || q.name === '+' || q.name === '-'));
  const read = nets.nets.map((net) => net.pins.some((q) => (q.dir === 'in' || ((q.dir === 'vcc' || q.dir === 'gnd') && q.name !== '+' && q.name !== '-'))));
  for (const b of nets.buttons) if (driven[b.a] !== driven[b.b] && read[driven[b.a] ? b.b : b.a]) read[driven[b.a] ? b.a : b.b] = true;
  const alone = nets.nets.map((net, i) => !read[i] || (net.pins.length === 1 && !net.wires.length));
  const netName = [];
  nets.nets.forEach((_, i) => { netName[i] = alone[i] ? null : fresh(`n${netName.filter(Boolean).length + 1}`); });
  const inst = new Map(m.parts.filter((p) => partDef(p.type)?.kind === 'ic').map((p) => [p.id, fresh(`u_${p.id}`)]));
  const Z = V ? "'Z'" : "1'bz";
  const rawNet = (id, n) => netName[nets.pinNet.get(`${id}.${n}`)];
  const pinNet = (id, n, dir = 'in') => netName[nets.pinNet.get(`${id}.${n}`)] ?? (dir === 'out' ? (V ? 'open' : '') : Z);

  const assigns = [];
  const lit = (v) => (V ? `'${v}'` : `1'b${v.toLowerCase()}`);
  for (const p of m.parts) {
    const d = partDef(p.type);
    if (d?.kind === 'supply') assigns.push([rawNet(p.id, 1), lit('1'), `${p.id} +`], [rawNet(p.id, 2), lit('0'), `${p.id} −`]);
    else if (p.type === 'logic-switch') assigns.push([rawNet(p.id, 1), portName(p), `${p.id}`]);
    else if (p.type === 'button') {
      const a = nets.pinNet.get(`${p.id}.1`), b = nets.pinNet.get(`${p.id}.2`);
      if (driven[a] !== driven[b]) {   // (both driven: an error of the check)
        const [from, to] = driven[a] ? [a, b] : [b, a];
        assigns.push([netName[to], V ? `${netName[from]} when ${portName(p)} = '1' else 'Z'` : `${portName(p)} ? ${netName[from]} : 1'bz`, `${p.id} pressed`]);
      }
    }
  }

  for (let k = assigns.length - 1; k >= 0; k--) if (!assigns[k][0]) assigns.splice(k, 1);   // (a net nothing reads)
  // a net nothing drives (an input floating): 'Z', said (a released button's net is its assignment's 'Z')
  const assigned = new Set(assigns.map(([n]) => n));
  nets.nets.forEach((net, i) => { if (netName[i] && !driven[i] && !assigned.has(netName[i])) assigns.push([netName[i], Z, 'floating: a 74LS input reads it high']); });
  const L = [];
  const rule = c + '='.repeat(78);
  L.push(rule, `${c} ${V ? 'Entity' : 'Module'}      : ${m.name}`, `${c} Description : the digital circuit ${source || `${m.name}.circ.json`}`);
  if (m.description) for (const line of m.description.split(/\r?\n/)) L.push(`${c}               ${line}`.trimEnd());
  L.push(`${c} Generator   : Silinx circuit editor (edit the circuit, not this file)`,
    `${c} Parts       : ${m.parts.filter((p) => partDef(p.type)?.kind === 'ic').map((p) => `${p.id} (${partDef(p.type).chip})`).join(', ') || 'no ICs'}`,
    `${c} Inputs      : ${ports.inputs.map((x) => `${x.name} (${x.part}, '1' while ${x.type === 'button' ? 'pressed' : 'on'})`).join(', ') || 'none'}`,
    `${c} Outputs     : ${ports.outputs.map((x) => `${x.name} (${x.part}, '1' while lit)`).join(', ') || 'none'}`, rule, '');
  if (!V) L.push('`timescale 1ns / 1ps', '');
  for (const d of types) (V ? vhdlIc : verilogIc)(L, entityOf(m, d), d);

  // the circuit's module
  const ins = ports.inputs.map((x) => x.name), outs = ports.outputs.map((x) => x.name);
  const leds = m.parts.filter((p) => p.type === 'led').map((p) => [portName(p), pinNet(p.id, 1), pinNet(p.id, 2)]);
  const icMap = (p) => partDef(p.type).pins.map((q) => [pinPort(q), pinNet(p.id, q.n, q.dir)]);
  if (V) {
    L.push('library ieee;', 'use ieee.std_logic_1164.all;', '');
    L.push(`entity ${m.name} is`);
    const ps = [...ins.map((n) => `${n} : in std_logic`), ...outs.map((n) => `${n} : out std_logic`)];
    if (ps.length) L.push('  port (', ps.map((x) => `    ${x}`).join(';\n'), '  );');
    L.push(`end entity ${m.name};`, '', `architecture circuit of ${m.name} is`);
    if (netName.some(Boolean)) L.push(`  signal ${netName.filter(Boolean).join(', ')} : std_logic := 'Z';`);
    L.push('begin');
    for (const [n, e, why] of assigns) L.push(`  ${n} <= ${e};   -- ${why}`);
    for (const p of m.parts) if (inst.has(p.id)) L.push(`  ${inst.get(p.id)} : entity work.${entityOf(m, partDef(p.type))} port map (${icMap(p).map(([a, b]) => `${a} => ${b}`).join(', ')});`);
    for (const [o, a, k] of leds) L.push(`  ${o} <= '1' when ${a} = '1' and ${k} = '0' else '0';`);
    L.push(`end architecture circuit;`);
  } else {
    L.push(`module ${m.name}${ins.length + outs.length ? ` (${[...ins.map((n) => `input ${n}`), ...outs.map((n) => `output ${n}`)].join(', ')})` : ''};`);
    if (netName.some(Boolean)) L.push(`  wire ${netName.filter(Boolean).join(', ')};`);
    for (const [n, e, why] of assigns) L.push(`  assign ${n} = ${e};   // ${why}`);
    for (const p of m.parts) if (inst.has(p.id)) L.push(`  ${entityOf(m, partDef(p.type))} ${inst.get(p.id)} (${icMap(p).map(([a, b]) => `.${a}(${b})`).join(', ')});`);
    for (const [o, a, k] of leds) L.push(`  assign ${o} = (${a} === 1'b1) && (${k} === 1'b0);`);
    L.push('endmodule');
  }
  return { filename: `${m.name}.${V ? 'vhd' : 'v'}`, code: L.join('\n') + '\n', module: m.name };
}

const GATE_V = { nand: (x) => `(${x.join(' nand ')})`, and: (x) => `(${x.join(' and ')})`, or: (x) => `(${x.join(' or ')})`, nor: (x) => `(${x.join(' nor ')})`, xor: (x) => `(${x.join(' xor ')})`, not: (x) => `(not ${x[0]})` };
const GATE_VL = { nand: (x) => `~(${x.join(' & ')})`, and: (x) => `(${x.join(' & ')})`, or: (x) => `(${x.join(' | ')})`, nor: (x) => `~(${x.join(' | ')})`, xor: (x) => `(${x.join(' ^ ')})`, not: (x) => `~${x[0]}` };
const byNumber = (d) => new Map(d.pins.map((p) => [p.n, p]));

// an IC's entity: its pins its ports, its gates with their delay, nothing driven while unpowered
function vhdlIc(L, name, d) {
  const pin = byNumber(d);
  L.push('library ieee;', 'use ieee.std_logic_1164.all;', '', `-- ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `entity ${name} is`, '  port (');
  L.push(d.pins.map((p) => `    ${pinPort(p)} : ${p.dir === 'out' ? "out std_logic := 'X'" : 'in std_logic'}`).join(';\n'), '  );', `end entity ${name};`, '');
  L.push(`architecture model of ${name} is`, '  -- a 74LS input reads a floating (Z) level high',
    '  function ttl(s : std_logic) return std_logic is', '  begin', '    case s is', "      when '0' | 'L' => return '0';", "      when '1' | 'H' | 'Z' => return '1';",
    "      when others => return 'X';", '    end case;', '  end function ttl;', '  signal pw : boolean;', 'begin', "  pw <= vcc = '1' and gnd = '0';");
  for (const g of d.gates) L.push(`  ${pinPort(pin.get(g.out))} <= ${GATE_V[g.fn](g.ins.map((n) => `ttl(${pinPort(pin.get(n))})`))} after ${d.tpd} ns when pw else 'Z' after ${d.tpd} ns;`);
  L.push(`end architecture model;`, '');
}

function verilogIc(L, name, d) {
  const pin = byNumber(d);
  L.push(`// ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `module ${name} (${d.pins.map((p) => `${p.dir === 'out' ? 'output' : 'input'} ${pinPort(p)}`).join(', ')});`,
    '  // a 74LS input reads a floating (z) level high', '  function ttl(input s);', "    ttl = (s === 1'bz) ? 1'b1 : s;", '  endfunction',
    "  wire pw = (vcc === 1'b1) && (gnd === 1'b0);");
  for (const g of d.gates) L.push(`  assign #${d.tpd} ${pinPort(pin.get(g.out))} = pw ? ${GATE_VL[g.fn](g.ins.map((n) => `ttl(${pinPort(pin.get(n))})`))} : 1'bz;`);
  L.push('endmodule', '');
}
