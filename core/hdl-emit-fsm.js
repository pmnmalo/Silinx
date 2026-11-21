// The state machines' skeleton (#5076): what the ASM chart's generator (core/asm-gen.js) and the state diagram's
// (core/fsm-hdl.js) write the same way, one copy of each: the machine's entity and module (its clock and reset first,
// then its inputs and outputs, in an aligned table), its state type and its states' constants. Isomorphic.
import { vhdlEntity, vhdlType, vlogModule, vlogRange } from './hdl-emit.js';

// a column's width: its longest text
const longest = (xs) => Math.max(...xs.map((x) => x.length));

/**
 * A state machine's VHDL entity, its lines: m is { name, clock, reset: { name }, inputs, outputs } (a port: { name,
 * width }); generics: [{ name, default }] (the ASM chart's parameters, integers).
 */
export function machineEntity(m, { generics = [] } = {}) {
  const ports = [{ name: m.clock, dir: 'in', type: 'std_logic' }, { name: m.reset.name, dir: 'in', type: 'std_logic' },
    ...m.inputs.map((p) => ({ name: p.name, dir: 'in', type: vhdlType(p.width) })), ...m.outputs.map((p) => ({ name: p.name, dir: 'out', type: vhdlType(p.width) }))];
  return vhdlEntity(m.name, { generics: generics.map((g) => ({ name: g.name, value: `${g.default}` })), alignGenerics: true,
    ports, indent: '    ', align: true, dirWidth: 3 });
}

/**
 * A state machine's Verilog module header, its lines: m as machineEntity's; outKind(output): its kind ('reg ' or
 * 'wire', four letters: the names in a column); generics: [{ name, default }].
 */
export function machineModule(m, { generics = [], outKind = () => 'reg ' } = {}) {
  const ports = [{ name: m.clock, dir: 'in', kind: 'wire', range: '' }, { name: m.reset.name, dir: 'in', kind: 'wire', range: '' },
    ...m.inputs.map((p) => ({ name: p.name, dir: 'in', kind: 'wire', width: p.width })), ...m.outputs.map((p) => ({ name: p.name, dir: 'out', kind: outKind(p), width: p.width }))];
  return vlogModule(m.name, { params: generics.map((g) => ({ name: g.name, value: g.default })), alignParams: true, paramIndent: '    ',
    ports, indent: '    ', align: true, dirWidth: 6 });
}

/**
 * The VHDL state type, its lines (after its heading, '-- state encoding'): an enumeration (encoding 'enum'), else a
 * subtype of W bits and a constant of each state, aligned. enc: [{ constName, bits }].
 */
export function vhdlStates(enc, W, encoding) {
  if (encoding === 'enum') return ['    -- state encoding', `    type state_t is (${enc.map((s) => s.constName).join(', ')});`];
  const cw = longest(enc.map((s) => s.constName));
  return ['    -- state encoding', `    subtype state_t is std_logic_vector(${W - 1} downto 0);`, ...enc.map((s) => `    constant ${s.constName.padEnd(cw)} : state_t := "${s.bits}";`)];
}

/** The Verilog states' constants (localparam), aligned, after their heading: enc as vhdlStates'. */
export function vlogStates(enc, W) {
  const cw = longest(enc.map((s) => s.constName));
  return ['    // ---------------------------------------------------------------- state encoding',
    ...enc.map((s) => `    localparam ${vlogRange(W)}${s.constName.padEnd(cw)} = ${W}'b${s.bits};`)];
}

/** VHDL: the state register's encoding is the user's (XST keeps it), the attribute's two lines. */
export const VHDL_USER_ENCODING = Object.freeze(['    attribute fsm_encoding : string;', '    attribute fsm_encoding of state_reg : signal is "user";']);
