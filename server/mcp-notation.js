// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The MCP server's notation of the Boolean expressions it shows (#3915): the interface's Settings ▸ Boolean Notation,
// kept in config.json (`notation`) for the MCP's user. set_notation reads or sets it; the tools that show expressions
// (related_view's results and state diagrams, set_output_logic) and the conversions (convert_module, convert_drawing:
// the conditions they write, #3915 part 2) use it, or the notation a call names. A truth table may have its own
// (#3939: its `notation`, as its editor's ⋮ menu sets it), which set_notation reads, sets or clears with its path.
import * as P from './projects.js';
import { loadConfig, saveConfig } from './toolchain.js';
import { toolError, readProject, projectText, PROJECT, STR } from './mcp-util.js';
import { NOTATIONS, NOTATION_IDS, notationOf } from '../core/expr-notation.js';

/** The notation set (config.json's), the default when none is. */
export async function notationSetting() {
  return notationOf((await loadConfig()).notation);
}

const LIST = NOTATIONS.map(([id, name, ex]) => `${id} (${name}: ${ex})`).join(', ');

export const NOTATION_TOOLS = [
  {
    name: 'set_notation', title: 'Boolean Notation',
    description: `The notation of the Boolean expressions Silinx shows (a truth table's results, its K-map groups, a state diagram's tables, the conditions a conversion writes: convert_module, convert_drawing, related_view's state diagrams): ${LIST}; the first the default. As the interface's Settings ▸ Boolean Notation, for this MCP server (kept in its configuration). With a project and the path of a truth table (.bool.json, .tt.json): that table's own notation, as its editor's ⋮ menu sets it (settings: none of its own, the one set). Without notation: the one set (or the table's). Expressions are typed in any of them.`,
    inputSchema: { type: 'object', properties: { notation: { type: 'string', enum: [...NOTATION_IDS, 'settings'], description: 'The notation to set (settings: a table\'s, none of its own).' },
      project: PROJECT, path: STR('A truth table of the project (.bool.json, .tt.json): its own notation.') }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ notation, project, path } = {}) {
      if (project !== undefined || path !== undefined) return tableNotation(project, path, notation);
      if (notation === 'settings') throw toolError('notation settings: a truth table\'s (its project and path)');
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

// a truth table's own notation (#3939): read, set or cleared ('settings'), the table written as its editor saves it
async function tableNotation(project, rel, notation) {
  if (project === undefined || rel === undefined) throw toolError('a table\'s notation: its project and its path');
  await readProject(project);
  if (!/\.(tt|bool)\.json$/i.test(rel)) throw toolError(`${rel}: a truth table (.bool.json, .tt.json) has a notation of its own`);
  const doc = JSON.parse(await projectText(project, rel, `no file '${rel}' in the project '${project}'`));
  const said = async id => (id ? name(id) : `as the settings, ${name(await notationSetting())}`);
  const was = NOTATION_IDS.includes(doc.notation) ? doc.notation : null;
  if (notation === undefined) return { text: `${rel}: Boolean notation: ${await said(was)}`, data: { project, path: rel, notation: was } };
  if (![...NOTATION_IDS, 'settings'].includes(notation)) throw toolError(`notation: ${[...NOTATION_IDS, 'settings'].join(', ')}`);
  const to = notation === 'settings' ? null : notation;
  if (to === was) return { text: `${rel}: Boolean notation: already ${await said(was)}`, data: { project, path: rel, notation: to } };
  if (to) doc.notation = to; else delete doc.notation;
  await P.writeFile(project, rel, JSON.stringify(doc, null, 2));
  return { text: `${rel}: Boolean notation: ${await said(to)}`, data: { project, path: rel, notation: to } };
}
