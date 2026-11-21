// Silinx - whether an HDL text defines a module (an entity in VHDL, a module in Verilog), one copy for the modules that
// asked it each its own way (#4772: the drawings' HDL files, the schematic's live simulation, the .xise project's top, the
// board's generics): outside comments, a declaration starting its line. VHDL's names in any letter case, Verilog's as
// written; `macromodule` as `module`. No Node or DOM API.
//
//   definesUnit(text, name, lang)   lang 'vhdl' | 'verilog' (else either)
import { escRegExp } from './escape.js';

/** Whether `text` (VHDL or Verilog, lang; either when not given) defines the entity or module `name` (see above). */
export function definesUnit(text, name, lang = null) {
  if (!name) return false;
  const n = escRegExp(name), t = String(text ?? '');
  const vhdl = () => new RegExp(`^\\s*entity\\s+${n}\\s+is\\b`, 'im').test(t.replace(/--[^\n]*/g, ''));
  const verilog = () => new RegExp(`^\\s*(?:macro)?module\\s+${n}\\b`, 'm').test(t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''));
  return lang === 'vhdl' ? vhdl() : lang === 'verilog' ? verilog() : vhdl() || verilog();
}
