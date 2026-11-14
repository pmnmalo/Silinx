// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The MCP server's notation of the Boolean expressions it shows (#3915): the interface's Settings ▸ Boolean Notation,
// kept in config.json (`notation`) for the MCP's user. set_notation reads or sets it; the tools that show expressions
// (related_view's results and state diagrams, set_output_logic) and the conversions (convert_module, convert_drawing:
// the conditions they write, #3915 part 2) use it, or the notation a call names.
import { loadConfig, saveConfig } from './toolchain.js';
import { toolError } from './mcp-util.js';
import { NOTATIONS, NOTATION_IDS, notationOf } from '../core/expr-notation.js';

/** The notation set (config.json's), the default when none is. */
export async function notationSetting() {
  return notationOf((await loadConfig()).notation);
}

const LIST = NOTATIONS.map(([id, name, ex]) => `${id} (${name}: ${ex})`).join(', ');

export const NOTATION_TOOLS = [
  {
    name: 'set_notation', title: 'Boolean Notation',
    description: `The notation of the Boolean expressions Silinx shows (a truth table's results, its K-map groups, a state diagram's tables, the conditions a conversion writes: convert_module, convert_drawing, related_view's state diagrams): ${LIST}; the first the default. As the interface's Settings ▸ Boolean Notation, for this MCP server (kept in its configuration). Without notation: the one set. Expressions are typed in any of them.`,
    inputSchema: { type: 'object', properties: { notation: { type: 'string', enum: NOTATION_IDS, description: 'The notation to set.' } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ notation } = {}) {
      const was = await notationSetting();
      if (notation === undefined) return { text: `Boolean notation: ${name(was)}`, data: { notation: was } };
      if (!NOTATION_IDS.includes(notation)) throw toolError(`notation: ${NOTATION_IDS.join(', ')}`);
      if (notation === was) return { text: `Boolean notation: already ${name(was)}`, data: { notation } };
      await saveConfig({ notation });
      return { text: `Boolean notation: ${name(notation)}`, data: { notation } };
    },
  },
];
const name = (id) => { const [, n, ex] = NOTATIONS.find(([x]) => x === id); return `${n} (${ex})`; };
