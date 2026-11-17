// The HDL of an IC written once in VHDL (#4397, core/circuit-model-ics.js): its core (the chip's model, its entity renamed
// after the IC's, `<ic>_core`), in VHDL as written and in Verilog as Silinx translates it (core/translate.js); and the IC's
// own entity around it, as the other ICs' (core/circuit-hdl-ics.js): its simulation model reads its pins as the chip
// does (rd: a 74LS input floating reads 1, a CMOS one X), runs the core, and drives its outputs after its delay while
// powered (else Z); its digital model, what synthesis builds, the core on its ports themselves, its outputs while powered.
// Isomorphic module.
import { translateSource } from './translate.js';

const pinPort = (p) => p.port;
const isOut = (p) => p.dir === 'out' || p.dir === 'oc';
const icPins = (d) => d.pins.filter((p) => p.dir !== 'nc');
const supplyOf = (d) => [pinPort(d.pins.find((p) => p.dir === 'vcc')), pinPort(d.pins.find((p) => p.dir === 'gnd'))];
const coreOf = (name) => `${name}_core`;
// (a three-state output, #4397: its IC's threeState's)
const tri = (d, p) => !!d.threeState?.outs.includes(pinPort(p));
// (an IC's inputs its core reads: but its outputs' enables)
const coreIns = (d, ins) => ins.filter((p) => !(d.threeState?.enable || []).some(([e]) => e === pinPort(p)));
const renamed = (text, from, to) => text.replace(new RegExp(`\\b${from}\\b`, 'g'), to);

// (each core translated once: its Verilog, its header's comment lines left out)
const translated = new Map();
function coreVerilog(d) {
  if (!translated.has(d.type)) {
    const r = translateSource(d.core.vhdl, { path: `${d.core.entity}.vhd`, to: 'verilog' });
    if (!r.ok) throw new Error(`${d.type}'s core cannot be translated to Verilog: ${r.errors.map((e) => `line ${e.line}: ${e.message}`).join('; ')}`);
    // (its lint's suppressions, the VHDL's `silinx: ignore` comments, carried by the translator: #4414)
    translated.set(d.type, r.text.split('\n').filter((l) => !/^\/\//.test(l)).join('\n').trim());
  }
  return translated.get(d.type);
}

/** A core's text in the circuit's HDL, its entity or module renamed `<name>_core`: its lines pushed on L. */
export function coreText(L, name, d, V) {
  const text = V ? d.core.vhdl.trim() : coreVerilog(d);
  L.push(`${V ? '--' : '//'} ${d.chip}'s model (Silinx's, written in VHDL${V ? '' : ' and translated'})`, ...renamed(text, d.core.entity, coreOf(name)).split('\n'), '');
}

/** The VHDL entity of an IC with a core and its simulation architecture (model): its lines pushed on L. */
export function vhdlCoreIc(L, name, d, rd) {
  const ins = icPins(d).filter((p) => p.dir === 'in'), outs = icPins(d).filter(isOut), [vcc, gnd] = supplyOf(d);
  L.push('library ieee;', 'use ieee.std_logic_1164.all;', '', `-- ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `entity ${name} is`, '  port (',
    icPins(d).map((p) => `    ${pinPort(p)} : ${isOut(p) ? "out std_logic := 'X'" : 'in std_logic'}`).join(';\n'), '  );', `end entity ${name};`, '');
  L.push(`architecture model of ${name} is`, ...rd, `  signal ${ins.map((p) => `i_${pinPort(p)}`).join(', ')} : std_logic := 'X';`, `  signal ${outs.map((p) => `o_${pinPort(p)}`).join(', ')} : std_logic;`,
    '  signal pw : boolean;', 'begin', `  pw <= ${vcc} = '1' and ${gnd} = '0';`, ...ins.map((p) => `  i_${pinPort(p)} <= rd(${pinPort(p)});`),
    `  u_core : entity work.${coreOf(name)} port map (${[...coreIns(d, ins).map((p) => `${pinPort(p)} => i_${pinPort(p)}`), ...outs.map((p) => `${pinPort(p)} => o_${pinPort(p)}`)].join(', ')});`,
    ...outs.map((p) => (tri(d, p) ? `  ${pinPort(p)} <= 'Z' after ${d.tpd} ns when not pw or ${d.threeState.enable.map(([e, a]) => `i_${e} = '${a === '0' ? 1 : 0}'`).join(' or ')} else 'X' after ${d.tpd} ns when ${d.threeState.enable.map(([e]) => `i_${e} = 'X'`).join(' or ')} else o_${pinPort(p)} after ${d.tpd} ns;`
      : `  ${pinPort(p)} <= o_${pinPort(p)} after ${d.tpd} ns when pw else 'Z' after ${d.tpd} ns;`)), 'end architecture model;', '');
}

/** The VHDL digital architecture of an IC with a core: its lines pushed on L. */
export function vhdlCoreDigital(L, name, d) {
  const ins = icPins(d).filter((p) => p.dir === 'in'), outs = icPins(d).filter(isOut), [vcc, gnd] = supplyOf(d);
  L.push(`architecture digital of ${name} is`, `  signal ${outs.map((p) => `o_${pinPort(p)}`).join(', ')} : std_logic;`, 'begin',
    `  u_core : entity work.${coreOf(name)} port map (${[...coreIns(d, ins).map((p) => `${pinPort(p)} => ${pinPort(p)}`), ...outs.map((p) => `${pinPort(p)} => o_${pinPort(p)}`)].join(', ')});`,
    // (a three-state output disabled: high, as the 74595's; the circuit's top takes its enable and gives the net its own level then)
    ...outs.map((p) => `  ${pinPort(p)} <= ${tri(d, p) ? `(o_${pinPort(p)} or not (${d.threeState.enable.map(([e, a]) => (a === '1' ? e : `not ${e}`)).join(' and ')}))` : `o_${pinPort(p)}`} and ${vcc} and not ${gnd};`), 'end architecture digital;', '');
}

/** The Verilog module of an IC with a core, its simulation body (before its `else): its lines pushed on L. */
export function verilogCoreIc(L, name, d, rd) {
  const ins = icPins(d).filter((p) => p.dir === 'in'), outs = icPins(d).filter(isOut), [vcc, gnd] = supplyOf(d);
  L.push(`// ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `module ${name} (${icPins(d).map((p) => `${isOut(p) ? 'output' : 'input'} ${pinPort(p)}`).join(', ')});`, ...rd,
    `  wire pw = (${vcc} === 1'b1) && (${gnd} === 1'b0);`, `  wire ${outs.map((p) => `o_${pinPort(p)}`).join(', ')};`,
    `  ${coreOf(name)} u_core (${[...coreIns(d, ins).map((p) => `.${pinPort(p)}(rd(${pinPort(p)}))`), ...outs.map((p) => `.${pinPort(p)}(o_${pinPort(p)})`)].join(', ')});`,
    ...outs.map((p) => (tri(d, p) ? `  assign #${d.tpd} ${pinPort(p)} = (!pw || ${d.threeState.enable.map(([e, a]) => `(rd(${e}) === 1'b${a === '0' ? 1 : 0})`).join(' || ')}) ? 1'bz : (${d.threeState.enable.map(([e]) => `(rd(${e}) === 1'bx)`).join(' || ')}) ? 1'bx : o_${pinPort(p)};`
      : `  assign #${d.tpd} ${pinPort(p)} = pw ? o_${pinPort(p)} : 1'bz;`)), 'endmodule', '');
}

/** The Verilog digital body of an IC with a core (after its `else), its module `name`. */
export function verilogCoreDigital(d, name) {
  const ins = icPins(d).filter((p) => p.dir === 'in'), outs = icPins(d).filter(isOut), [vcc, gnd] = supplyOf(d);
  return [`  wire ${outs.map((p) => `o_${pinPort(p)}`).join(', ')};`,
    `  ${coreOf(name)} u_core (${[...coreIns(d, ins).map((p) => `.${pinPort(p)}(${pinPort(p)})`), ...outs.map((p) => `.${pinPort(p)}(o_${pinPort(p)})`)].join(', ')});`,
    ...outs.map((p) => `  assign ${pinPort(p)} = ${tri(d, p) ? `(o_${pinPort(p)} | ~(${d.threeState.enable.map(([e, a]) => (a === '1' ? e : `~${e}`)).join(' & ')}))` : `o_${pinPort(p)}`} & ${vcc} & ~${gnd};`)];
}
