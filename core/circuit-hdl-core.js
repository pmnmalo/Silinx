// The HDL of an IC written once in VHDL (#4397, core/circuit-model-ics.js): its core (the chip's model, its entity renamed
// after the IC's, `<ic>_core`), in VHDL as written and in Verilog as Silinx translates it (core/translate.js); and the IC's
// own entity around it, as the other ICs' (core/circuit-hdl-ics.js): its simulation model reads its pins as the chip
// does (rd: a 74LS input floating reads 1, a CMOS one X), runs the core, and drives its outputs after its delay while
// powered (else Z; an open collector's 1: Z, the 74596's); its digital model, what synthesis builds, the core on its
// ports themselves, its outputs while powered.
// Isomorphic module.
import { translateSource } from './translate.js';
import { vhdlEntity, vlogModule } from './hdl-emit.js';

const pinPort = (p) => p.port;
const isOut = (p) => p.dir === 'out' || p.dir === 'oc';
const icPins = (d) => d.pins.filter((p) => p.dir !== 'nc');
const supplyOf = (d) => [pinPort(d.pins.find((p) => p.dir === 'vcc')), pinPort(d.pins.find((p) => p.dir === 'gnd'))];
const coreOf = (name) => `${name}_core`;
// (a three-state output, #4397: its IC's threeState's)
const tri = (d, p) => !!d.threeState?.outs.includes(pinPort(p));
// (an output's enables: its section's, the 74253's two)
const enOf = (d, p) => (d.threeState.sections?.find((s) => s.outs.includes(pinPort(p))) ?? d.threeState).enable;
// (an IC's inputs its core reads: but its outputs' enables)
const coreIns = (d, ins) => ins.filter((p) => !(d.threeState?.enable || []).some(([e]) => e === pinPort(p)));
// (an enable one of the IC's outputs, #4397: the 74348's GS̅, its core's level; else its input as the chip reads it)
const outEn = (d, e) => icPins(d).find((p) => pinPort(p) === e)?.dir !== 'in';
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
  L.push('library ieee;', 'use ieee.std_logic_1164.all;', '', `-- ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, ...vhdlEntity(name, { ports: icPins(d).map((p) => ({ name: pinPort(p), dir: isOut(p) ? 'out' : 'in', type: 'std_logic', init: isOut(p) ? "'X'" : null })) }), '');
  L.push(`architecture model of ${name} is`, ...rd, `  signal ${ins.map((p) => `i_${pinPort(p)}`).join(', ')} : std_logic := 'X';`, `  signal ${outs.map((p) => `o_${pinPort(p)}`).join(', ')} : std_logic;`,
    ...(outs.some((p) => p.dir === 'oc') ? ['  -- an open collector output: a 0, or nothing', '  function oc(s : std_logic) return std_logic is', '  begin', "    if s = '0' then return '0'; elsif s = '1' then return 'Z'; else return 'X'; end if;", '  end function oc;'] : []),
    '  signal pw : boolean;', 'begin', `  pw <= ${vcc} = '1' and ${gnd} = '0';`, ...ins.map((p) => `  i_${pinPort(p)} <= rd(${pinPort(p)});`),
    `  u_core : entity work.${coreOf(name)} port map (${[...coreIns(d, ins).map((p) => `${pinPort(p)} => i_${pinPort(p)}`), ...outs.map((p) => `${pinPort(p)} => o_${pinPort(p)}`)].join(', ')});`,
    ...outs.map((p) => (tri(d, p) ? `  ${pinPort(p)} <= 'Z' after ${d.tpd} ns when not pw or ${enOf(d, p).map(([e, a]) => `${outEn(d, e) ? 'o' : 'i'}_${e} = '${a === '0' ? 1 : 0}'`).join(' or ')} else 'X' after ${d.tpd} ns when ${enOf(d, p).map(([e]) => `${outEn(d, e) ? 'o' : 'i'}_${e} = 'X'`).join(' or ')} else o_${pinPort(p)} after ${d.tpd} ns;`
      : `  ${pinPort(p)} <= ${p.dir === 'oc' ? `oc(o_${pinPort(p)})` : `o_${pinPort(p)}`} after ${d.tpd} ns when pw else 'Z' after ${d.tpd} ns;`)), 'end architecture model;', '');
}

/** The VHDL digital architecture of an IC with a core: its lines pushed on L. */
export function vhdlCoreDigital(L, name, d) {
  const ins = icPins(d).filter((p) => p.dir === 'in'), outs = icPins(d).filter(isOut), [vcc, gnd] = supplyOf(d);
  L.push(`architecture digital of ${name} is`, `  signal ${outs.map((p) => `o_${pinPort(p)}`).join(', ')} : std_logic;`, 'begin',
    `  u_core : entity work.${coreOf(name)} port map (${[...coreIns(d, ins).map((p) => `${pinPort(p)} => ${pinPort(p)}`), ...outs.map((p) => `${pinPort(p)} => o_${pinPort(p)}`)].join(', ')});`,
    // (a three-state output disabled: high, as the 74595's; the circuit's top takes its enable and gives the net its own level then)
    ...outs.map((p) => `  ${pinPort(p)} <= ${tri(d, p) ? `(o_${pinPort(p)} or not (${enOf(d, p).map(([e, a]) => { const r = outEn(d, e) ? `o_${e}` : e; return a === '1' ? r : `not ${r}`; }).join(' and ')}))` : `o_${pinPort(p)}`} and ${vcc} and not ${gnd};`), 'end architecture digital;', '');
}

/** The Verilog module of an IC with a core, its simulation body (before its `else): its lines pushed on L. */
export function verilogCoreIc(L, name, d, rd) {
  const ins = icPins(d).filter((p) => p.dir === 'in'), outs = icPins(d).filter(isOut), [vcc, gnd] = supplyOf(d);
  L.push(`// ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, ...vlogModule(name, { inline: true, ports: icPins(d).map((p) => ({ name: pinPort(p), dir: isOut(p) ? 'out' : 'in', range: '' })) }), ...rd,
    ...(outs.some((p) => p.dir === 'oc') ? ['  // an open collector output: a 0, or nothing', '  function oc(input s);', "    oc = (s === 1'b0) ? 1'b0 : (s === 1'b1) ? 1'bz : 1'bx;", '  endfunction'] : []),
    `  wire pw = (${vcc} === 1'b1) && (${gnd} === 1'b0);`, `  wire ${outs.map((p) => `o_${pinPort(p)}`).join(', ')};`,
    `  ${coreOf(name)} u_core (${[...coreIns(d, ins).map((p) => `.${pinPort(p)}(rd(${pinPort(p)}))`), ...outs.map((p) => `.${pinPort(p)}(o_${pinPort(p)})`)].join(', ')});`,
    ...outs.map((p) => (tri(d, p) ? `  assign #${d.tpd} ${pinPort(p)} = (!pw || ${enOf(d, p).map(([e, a]) => `(${outEn(d, e) ? `o_${e}` : `rd(${e})`} === 1'b${a === '0' ? 1 : 0})`).join(' || ')}) ? 1'bz : (${enOf(d, p).map(([e]) => `(${outEn(d, e) ? `o_${e}` : `rd(${e})`} === 1'bx)`).join(' || ')}) ? 1'bx : o_${pinPort(p)};`
      : `  assign #${d.tpd} ${pinPort(p)} = pw ? ${p.dir === 'oc' ? `oc(o_${pinPort(p)})` : `o_${pinPort(p)}`} : 1'bz;`)), 'endmodule', '');
}

/** The Verilog digital body of an IC with a core (after its `else), its module `name`. */
export function verilogCoreDigital(d, name) {
  const ins = icPins(d).filter((p) => p.dir === 'in'), outs = icPins(d).filter(isOut), [vcc, gnd] = supplyOf(d);
  return [`  wire ${outs.map((p) => `o_${pinPort(p)}`).join(', ')};`,
    `  ${coreOf(name)} u_core (${[...coreIns(d, ins).map((p) => `.${pinPort(p)}(${pinPort(p)})`), ...outs.map((p) => `.${pinPort(p)}(o_${pinPort(p)})`)].join(', ')});`,
    ...outs.map((p) => `  assign ${pinPort(p)} = ${tri(d, p) ? `(o_${pinPort(p)} | ~(${enOf(d, p).map(([e, a]) => { const r = outEn(d, e) ? `o_${e}` : e; return a === '1' ? r : `~${r}`; }).join(' & ')}))` : `o_${pinPort(p)}`} & ${vcc} & ~${gnd};`)];
}
