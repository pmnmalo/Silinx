// The Top-Level Source Type (#4105): what the top of a new (empty) project is made of (New Project), a setting of the
// project then (Design Properties, the MCP server's set_design_properties: saved as ISE's property is, nothing made).
// A design and simulation project's (#3780): the drawings' only, no HDL nor C / C++. Isomorphic module (browser + Node).
import { isDesignOnly } from './project-kind.js';

/** The types: id, label (the interface's), the top document New Project makes (none: HDL, its module written by hand). */
export const TOP_TYPES = [
  { id: 'hdl', label: 'HDL' },
  { id: 'sch', label: 'Schematic', file: 'src/top.sch.json' },
  { id: 'fsm', label: 'Finite State Machine (FSM)', file: 'src/top.fsm.json' },
  { id: 'asm', label: 'Algorithmic State Machine (ASM)', file: 'src/top.asm.json' },
  { id: 'tt', label: 'Boolean Algebra', file: 'src/top.bool.json' },
  { id: 'petri', label: 'Petri Net', file: 'src/top.pn.json' },
  { id: 'circuit', label: 'Digital Electronic Circuit', file: 'src/top.circ.json' },
  { id: 'c', label: 'C Function (HLS)', file: 'src/top.c' },
  { id: 'cpp', label: 'C++ Function (HLS)', file: 'src/top.cpp' },
];
/** The types of the HDL side, none of a design and simulation project's. */
export const HDL_TOP_TYPES = ['hdl', 'c', 'cpp'];
/** A type by its id, or null. */
export const topType = id => TOP_TYPES.find(t => t.id === id) || null;
/** The project's type (a project from before the setting: HDL's). */
export const projectTopType = pj => topType(pj?.topSourceType) || TOP_TYPES[0];
/** Why the type `id` is not one of the project `pj`'s, or null. */
export function topTypeRefusal(pj, id) {
  if (!topType(id)) return `top_source_type: one of ${TOP_TYPES.map(t => t.id).join(', ')}`;
  if (isDesignOnly(pj) && HDL_TOP_TYPES.includes(id)) return `top_source_type ${id}: a design and simulation project's top is a drawing (${TOP_TYPES.filter(t => !HDL_TOP_TYPES.includes(t.id)).map(t => t.id).join(', ')})`;
  return null;
}
