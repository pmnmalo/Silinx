// The size of the MCP server's tools/list (#4752): what a client puts in its model's context at every session (it was
// ~147 KB, ~37k tokens). The whole list under a budget, each tool's description and each argument's description short:
// what the tool does and what it needs, not the interface's history (that is the documentation's and the issues').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../server/mcp.js';

/** The budget of tools/list's JSON, in characters, and of one tool's description and one argument's. */
export const LIST_MAX = 128 * 1024, TOOL_MAX = 700, ARG_MAX = 250;
const list = TOOLS.map(({ run, ...t }) => t);

test('#4752 tools/list under its budget', () => {
  const size = JSON.stringify({ tools: list }).length;
  assert.ok(size <= LIST_MAX, `tools/list: ${size} characters, over ${LIST_MAX}`);
});

test('#4752 each tool\'s description and each argument\'s short', () => {
  const long = [];
  const walk = (s, where) => {
    if (!s || typeof s !== 'object') return;
    if (typeof s.description === 'string' && s.description.length > ARG_MAX) long.push(`${where}: ${s.description.length}`);
    for (const [k, v] of Object.entries(s.properties || {})) walk(v, `${where}.${k}`);
    if (s.items) walk(s.items, `${where}[]`);
    for (const a of s.anyOf || []) walk(a, `${where}|`);
    if (typeof s.additionalProperties === 'object') walk(s.additionalProperties, `${where}{}`);
  };
  for (const t of list) {
    if (t.description.length > TOOL_MAX) long.push(`${t.name}: ${t.description.length}`);
    for (const [k, v] of Object.entries(t.inputSchema.properties || {})) walk(v, `${t.name}.${k}`);
  }
  assert.deepEqual(long, [], `over ${TOOL_MAX} (a tool) or ${ARG_MAX} (an argument) characters`);
});
