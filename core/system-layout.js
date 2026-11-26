// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A System project's layout (#5488, roadmap #5479, docs/SYSTEMS.md "The general model"): a node is a folder of the one
// System project, never a sub-project. Each node's files (an FPGA node's modules and constraints, a microcontroller's
// C, .py, .hex) live in `<id>/`, the folder named by the node's id (an identifier, core/ident.js isName); the System
// document is at the project's root. Each node has its base language, stored with it in the System document: its new
// sources default to it, its drawings generate it. Languages mix in a node only where the toolchain joins them (VHDL
// with Verilog on an FPGA, C with C++ and assembly on a CPU). One module for the server, the web and the MCP server.
// Isomorphic module (browser + Node).

import { isName } from './ident.js';

/** The base languages of each node kind, its default first (a kind with none has no sources of its own: a terminal, a
 *  circuit, whose drawing is its own). */
export const NODE_LANGS = { fpga: ['vhdl', 'verilog'], design: ['vhdl', 'verilog'], mcu: ['c', 'cpp', 'micropython'], terminal: [], circuit: [], broker: [] };
/** The languages' names, as the interface and the MCP server say them. */
export const LANG_NAMES = { vhdl: 'VHDL', verilog: 'Verilog', c: 'C', cpp: 'C++', micropython: 'MicroPython', asm: 'assembly' };
// what a base language joins in its node (the toolchain's own joins: mixed HDL; gcc's C, C++ and assembly)
const JOINS = { vhdl: ['vhdl', 'verilog'], verilog: ['vhdl', 'verilog'], c: ['c', 'cpp', 'asm'], cpp: ['c', 'cpp', 'asm'], micropython: ['micropython'] };

// a node kind in a sentence
const KIND_TEXT = { fpga: 'an FPGA node', design: 'a design node', mcu: 'a microcontroller node', terminal: 'a terminal node', circuit: 'a circuit node' };

/** A node kind's languages (none for an unknown kind). */
export const nodeLangs = kind => NODE_LANGS[kind] ?? [];

/** A node's base language: its own when its kind has it, else its kind's default (`preferred`, the project's preferred
 *  HDL, when the kind has it), else null (a kind with no language). */
export function baseLang(node, preferred = null) {
  const langs = nodeLangs(node?.kind);
  if (langs.includes(node?.lang)) return node.lang;
  if (langs.includes(preferred)) return preferred;
  return langs[0] ?? null;
}

/** Why `lang` is not a base language of a node of kind `kind`, or null. */
export function langError(kind, lang) {
  const langs = nodeLangs(kind), what = KIND_TEXT[kind] ?? `a ${kind} node`;
  if (!langs.length) return `${what} has no base language`;
  return langs.includes(lang) ? null : `'${lang}' is not ${what}'s base language: ${langs.join(', ')}`;
}

/** Whether a source in `lang` may sit in a node whose base language is `base` (they mix where the toolchain joins them). */
export const langMixes = (base, lang) => (JOINS[base] ?? []).includes(lang);

/** A source file's language by its name: 'vhdl', 'verilog', 'c', 'cpp', 'asm', 'micropython', else null. */
export function sourceLang(path) {
  const p = String(path ?? '');
  if (/\.(vhd|vhdl)$/i.test(p)) return 'vhdl';
  if (/\.(v|vh|sv)$/i.test(p)) return 'verilog';
  if (/\.(cpp|cc|cxx|hpp|ino)$/i.test(p)) return 'cpp';
  if (/\.(c|h)$/i.test(p)) return 'c';
  if (/\.(s|asm)$/i.test(p)) return 'asm';
  if (/\.py$/i.test(p)) return 'micropython';
  return null;
}

/** Why `rel` is not a safe path inside a folder (empty, absolute, a backslash, a NUL, a `.` or `..` part, an empty
 *  part), or null. The server checks its joins again (server/projects.js safeJoin). */
export function relPathError(rel) {
  const s = String(rel ?? '');
  if (!s) return 'an empty path';
  if (/[\\\0]/.test(s) || /^[A-Za-z]:/.test(s)) return `'${s}' is not a project's path`;
  if (s.startsWith('/')) return `'${s}' is an absolute path`;
  if (s.split('/').some(p => p === '' || p === '.' || p === '..')) return `'${s}' escapes its folder`;
  return null;
}

/** A node's folder (its id), or throws when the id is no identifier (#5446: a node's id names its folders). */
export function nodeDir(id) {
  if (!isName(String(id ?? ''))) throw new Error(`'${id}' is not a node's id: a letter, then letters, digits and _`);
  return String(id);
}

/** A file's path in the project from its path in the node's folder (`<id>/<rel>`), or throws on a bad id or path. */
export function nodePath(id, rel) {
  const dir = nodeDir(id), why = relPathError(rel);
  if (why) throw new Error(why);
  return `${dir}/${rel}`;
}

/** A project path's node folder (its first part when it is a node's id, as ids compare: in any case), or null: a file at
 *  the root (the System document) or in a folder that is no node's. `ids` the System's node ids. */
export function nodeOfPath(path, ids) {
  const s = String(path ?? ''), i = s.indexOf('/');
  if (i <= 0 || relPathError(s)) return null;
  const head = s.slice(0, i).toLowerCase();
  return [...ids].find(id => String(id).toLowerCase() === head) ?? null;
}

/** A project path in the node's folder `id`: its path there, else null. */
export function relInNode(path, id) {
  const s = String(path ?? ''), pre = `${String(id)}/`;
  return s.toLowerCase().startsWith(pre.toLowerCase()) && !relPathError(s) ? s.slice(pre.length) : null;
}

/** A path renamed with its node (`old/…` → `new/…`), others as they are. */
export const renamedPath = (path, from, to) => {
  const rel = relInNode(path, from);
  return rel == null ? path : `${to}/${rel}`;
};

/** The paths of `files` (the project's) in the node `id`'s folder. */
export const nodeFilesOf = (files, id) => files.filter(f => relInNode(f, id) != null);

/** A System's files grouped by node: { root (the files at the root or in no node's folder), nodes: { <id>: [...] } }. */
export function groupByNode(files, ids) {
  const nodes = Object.fromEntries([...ids].map(id => [id, []])), root = [];
  for (const f of files) {
    const id = nodeOfPath(f, ids);
    (id == null ? root : nodes[id]).push(f);
  }
  return { root, nodes };
}

/** A node's renames chained ([{ from, to }] in the order its edits made them: a → b, b → c is a → c). */
function chained(renames) {
  const chain = new Map();   // its id when saved -> its id now
  for (const { from, to } of renames) {
    const origin = [...chain].find(([, now]) => now === from)?.[0] ?? from;
    chain.set(origin, to);
  }
  return chain;
}

/**
 * What saving a System does to its nodes' folders (#5488): { renames: [{ from, to }] (a node's folder renamed with it),
 * removed: [id] (a removed node's folder, deleted when the user says so) }, from the System as it was saved (`before`),
 * as it is (`after`) and the renames its edits made since ([{ from, to }], in order). A rename undone, or whose old id
 * is a node's again, renames nothing; a node added has no folder until its first file (folders are a path's, in every
 * store: git's and a zip's too).
 */
export function layoutPlan(before, after, renames = []) {
  const was = new Set((before?.nodes ?? []).map(n => n.id)), now = new Set((after?.nodes ?? []).map(n => n.id));
  const out = [];
  for (const [from, to] of chained(renames)) if (from !== to && was.has(from) && !now.has(from) && now.has(to) && !was.has(to)) out.push({ from, to });
  const moved = new Set(out.map(r => r.from));
  return { renames: out, removed: [...was].filter(id => !now.has(id) && !moved.has(id)) };
}

/** Where a new source goes in a System (#5488): { node, location, lang } in the node `id`'s folder, else the System's first
 *  FPGA or design node's: its folder (a sub-folder `dir`, a test bench's sim or a constraints file's, inside it; a lab's
 *  labs at the root), its base language (`preferred`, the project's preferred HDL, when it has none of its own); null when
 *  the System has no such node. New Source's and the MCP's new_source's. */
export function sourcePlace(sys, { id = null, dir = 'src', preferred = null } = {}) {
  const nodes = sys?.nodes ?? [];
  const n = nodes.find(x => x.id === id && nodeLangs(x.kind).length) ?? nodes.find(x => x.kind === 'fpga' || x.kind === 'design');
  if (!n) return null;
  const location = dir === 'labs' ? 'labs' : !dir || dir === 'src' ? n.id : `${n.id}/${dir}`;
  return { node: n.id, location, lang: baseLang(n, preferred) };
}
