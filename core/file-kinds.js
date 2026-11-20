// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A project file's kind by its name (#4733): an HDL source's language, a constraints file (any family's format), a C
// source, a test bench's role. One place for the rules the interface, the MCP server, the stores and the live share
// typed each its own way. Isomorphic module (browser + Node).

import { CONSTRAINTS_FILE } from './flow-files.js';

// a VHDL source's name
const VHDL_RE = /\.(vhd|vhdl)$/i;
// a Verilog source's name (a SystemVerilog one, an include header)
const VERILOG_RE = /\.(v|vh|sv)$/i;
/** An HDL source's name. */
export const HDL_RE = /\.(vhd|vhdl|v|vh|sv)$/i;
/** A C or C++ source's name (a header too). */
export const C_RE = /\.(c|cc|cpp|cxx|h|hpp)$/i;

/** An HDL source's language: 'vhdl', 'verilog', else null. */
export const hdlLangOf = p => (VHDL_RE.test(String(p)) ? 'vhdl' : VERILOG_RE.test(String(p)) ? 'verilog' : null);
/** A file's language as silinx.json lists it: 'vhdl', 'verilog', 'ucf' (a constraints file), else 'text'. */
export const langOfPath = p => hdlLangOf(p) || (CONSTRAINTS_FILE.test(String(p)) ? 'ucf' : 'text');
/** A constraints file (any family's format). */
export const isConstraintsFile = p => CONSTRAINTS_FILE.test(String(p));
/** An HDL source's role by its path: 'sim' in sim/, tb/ or test/, or named tb_…, …_tb.… or …_tb; else 'design'. */
export const roleOfPath = p => (/^(sim|tb|test)\//.test(String(p)) || /(^|\/)tb_|_tb\.|_tb$/.test(String(p)) ? 'sim' : 'design');
