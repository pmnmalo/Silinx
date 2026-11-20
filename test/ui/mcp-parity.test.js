// UI: every action of the menu bar has its MCP tools or its reason in core/mcp-parity.js (#2674, #4751): the menus walked,
// their submenus too, with no project and with a project open (its git items, Set as Top…), in this interface (CI runs it
// in both): an action the table does not know fails, so a new menu item gets its tool or its reason. A project's name
// (Recent Projects) is not an action of its own; Undo / Redo with what they undo are Edit's Undo / Redo.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { MENU_PARITY } from '../../core/mcp-parity.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the menu bar's actions, by their path, disabled ones too
const actions = (page) => page.eval(() => {
  const out = [];
  const walk = (items, trail) => {
    for (const it of (typeof items === 'function' ? items() : items) || []) {
      if (!it || it === '-' || it.raw) continue;
      const label = trail[0] === 'Edit' ? String(it.label).trim().replace(/^(Undo|Redo) .+$/, '$1') : String(it.label).trim();
      if (it.submenu) walk(it.submenu, [...trail, label]);
      else if (it.action) out.push([...trail, label].join(' > '));
    }
  };
  for (const m of window.Silinx.menus) walk(m.items, [m.label]);
  return out;
});

uiTest('#4751 every menu action has its MCP tools or its reason (core/mcp-parity.js)', E, async (page) => {
  const seen = new Set(await actions(page));
  await makeProject(env, { name: 'Parity', template: 'empty', board: 'basys2-250' });
  await page.openProject('Parity');
  for (const a of await actions(page)) seen.add(a);
  const unknown = [...seen].filter(a => !MENU_PARITY[a]);
  assert.deepEqual(unknown, [], `menu actions with neither a tool nor a reason in core/mcp-parity.js:\n${unknown.join('\n')}`);
  // (the table's own: iMPACT's window and Toolchain Settings among the actions walked)
  for (const a of ['Tools > iMPACT (Configure Target Device)', 'Tools > Toolchain Settings (ISE / Programmers)…', 'Project > New Source…', 'Process > Check Syntax']) assert.ok(seen.has(a), a);
  assert.ok(seen.size >= 70, `${seen.size} actions`);
});
