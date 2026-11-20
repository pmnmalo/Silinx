// What the interface does, the MCP server does too (#2674, #4751): core/mcp-parity.js's table of the menu bar's actions
// names only the server's tools, each entry a list of tools or a reason; Toolchain Settings an exception (the user's, as
// trusting a project, #2830) read by toolchain_info only, no tool writing the toolchain's settings; the reasons said in the
// MCP documentation. test/ui/mcp-parity.test.js walks the menus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MENU_PARITY, EXCEPTIONS, VIEW, EDITOR, toolsOf } from '../core/mcp-parity.js';
import { TOOLS } from '../server/mcp.js';

const NAMES = new Set(TOOLS.map(t => t.name));

test('#4751 every tool the table names is one of the server\'s; every entry tools or a reason', () => {
  for (const [path, e] of Object.entries(MENU_PARITY)) {
    assert.match(path, /^(File|Edit|View|Project|Process|Tools|Window|Help) > \S/, path);
    if (Array.isArray(e)) assert.ok(e.length, path);
    else {
      const reasons = ['view', 'editor', 'exception'].filter(k => e[k]);
      assert.equal(reasons.length, 1, `${path}: one reason`);
      assert.deepEqual(Object.keys(e).filter(k => !['view', 'editor', 'exception', 'tools'].includes(k)), [], path);
    }
    for (const t of toolsOf(path)) assert.ok(NAMES.has(t), `${path}: no tool ${t}`);
  }
  assert.ok(Object.values(MENU_PARITY).some(e => e.view === VIEW) && Object.values(MENU_PARITY).some(e => e.editor === EDITOR));
  assert.deepEqual(toolsOf('No > Such'), []);
});

test('#4751 Toolchain Settings: an exception, its reason the user\'s settings (#2830); toolchain_info reads them, no tool writes them', () => {
  const e = MENU_PARITY['Tools > Toolchain Settings (ISE / Programmers)…'];
  assert.deepEqual(e, { exception: EXCEPTIONS.toolchain, tools: ['toolchain_info'] });
  assert.match(EXCEPTIONS.toolchain, /the user's, set in the interface only, as trusting a project is \(#2830\)/);
  const info = TOOLS.find(t => t.name === 'toolchain_info');
  assert.equal(info.annotations.readOnlyHint, true);
  assert.deepEqual(TOOLS.filter(t => /toolchain|programmer/i.test(t.name)).map(t => t.name), ['toolchain_info']);
  // (iMPACT's window: all of it)
  assert.deepEqual(toolsOf('Tools > iMPACT (Configure Target Device)'), ['program_board', 'program_prom', 'jtag_scan', 'bitstream_info']);
});

test('#4751 the MCP documentation lists the new tools and the exceptions, in English and Portuguese', () => {
  for (const lang of ['en', 'pt']) {
    const doc = fs.readFileSync(new URL(`../docs/user/${lang}/ai-mcp.md`, import.meta.url), 'utf8');
    for (const t of ['program_prom', 'jtag_scan', 'bitstream_info', 'toolchain_info']) assert.ok(doc.includes(`\`${t}\``), `${lang}: ${t}`);
    assert.match(doc, /#2830/, lang);
    assert.match(doc, lang === 'en' ? /Toolchain Settings/ : /Definições da Toolchain/, lang);
  }
});
