// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A tool's renamed arguments (#4752): the old name still accepted, deprecated, its value given to the new one, the result
// saying so, so that a client of before the rename keeps working while the schema (additionalProperties false) lists only
// the new name. One table for every tool, checked before the arguments are (server/mcp-args.js).
import { schemaErrors } from './mcp-args.js';

// (design_only, #4103, and kind, #5440: the profile's names of before)
const designOnly = v => (v ? 'logic' : 'fpga');
const fromKind = v => (v === 'design' ? 'logic' : v);
/** The deprecated arguments: { tool, from (the old name), to (the new), schema (the old value's), value(old) (the new
 *  value), since (the issue), how (the old value's meaning) }. */
export const ALIASES = [
  { tool: 'new_project', from: 'design_only', to: 'profile', schema: { type: 'boolean' }, value: designOnly, since: '#4103', how: 'true is profile logic' },
  { tool: 'set_design_properties', from: 'design_only', to: 'profile', schema: { type: 'boolean' }, value: designOnly, since: '#4103', how: 'true is profile logic, false profile fpga' },
  { tool: 'new_project', from: 'kind', to: 'profile', schema: { type: 'string', enum: ['fpga', 'design', 'system'] }, value: fromKind, since: '#5440', how: 'design is profile logic, fpga and system the same' },
  { tool: 'set_design_properties', from: 'kind', to: 'profile', schema: { type: 'string', enum: ['fpga', 'design'] }, value: fromKind, since: '#5440', how: 'design is profile logic, fpga the same' },
];

/** A call's arguments with its tool's deprecated ones renamed: { args, warnings } (each alias used, said), or { error }
 *  (both names given, or the old one's value wrong). */
export function withAliases(tool, args) {
  const used = ALIASES.filter(a => a.tool === tool.name && args && typeof args === 'object' && args[a.from] !== undefined);
  if (!used.length) return { args, warnings: [] };
  const out = { ...args }, warnings = [];
  for (const a of used) {
    if (out[a.to] !== undefined) return { error: `${tool.name}: give ${a.to}, not ${a.from} too (${a.from} is ${a.to}'s deprecated alias)` };
    const wrong = schemaErrors(out[a.from], a.schema, a.from);
    if (wrong.length) return { error: `${tool.name}: ${wrong.join('; ')}` };
    out[a.to] = a.value(out[a.from]);
    delete out[a.from];
    warnings.push(`WARNING: ${a.from} is deprecated (${a.since}): give ${a.to} (${a.how}).`);
  }
  return { args: out, warnings };
}
