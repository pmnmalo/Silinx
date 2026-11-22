// Usability (#5206, phase 1): the HDL editor as a person writes a module in it, from an empty file: a 4-bit counter in
// VHDL and in Verilog (lib/hdl-designs.js) typed line after line, character by character, the editor closing the
// brackets and the quotes, a completion's word taken from its list, the indentation the editor gives corrected with
// Backspace and Tab; the text after every line the typing's model's (lib/hdl-typing.js). A mistake made on purpose (a
// ';' left out): Check Syntax's lines exactly, its error in the Errors tab, a click on it to its line; the ';' typed
// there, Check Syntax clean (no warnings); Undo back to the empty file and Redo to the end; the file saved as typed.
// In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from '../ui/harness.js';
import { HdlSession } from './lib/hdl-session.js';
import { DESIGNS } from './lib/hdl-designs.js';
import { editorState } from './lib/hdl-actions.js';
import { RUN } from './lib/session.js';

const FILE = 'test/usability/hdl-edit.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// each language: Check Syntax's lines with the mistake, and once fixed (the console's own, in English in any language;
// Verilog's one process in the singular: #5222)
const CHECK = {
  vhdl: {
    failed: [
      'Started : "Check Syntax" of src/counter.vhd.',
      'Parsing VHDL file "src/counter.vhd" into library work',
      'Elaborating module <counter>: 5 signals, 2 processes.',
      'ERROR:HDLCompiler - "src/counter.vhd" Line 21: expected \';\' after \'1\'',
      'Process "Check Syntax" failed (1 error(s), 0 warning(s))',
    ],
    line: 21,
    clean: [
      'Started : "Check Syntax" of src/counter.vhd.',
      'Parsing VHDL file "src/counter.vhd" into library work',
      'Elaborating module <counter>: 5 signals, 2 processes.',
      'Process "Check Syntax" completed successfully',
    ],
  },
  verilog: {
    failed: [
      'Started : "Check Syntax" of src/counter.v.',
      'Analyzing Verilog file "src/counter.v" into library work',
      'Elaborating module <counter>: 4 signals, 1 process.',
      'ERROR:HDLCompiler - "src/counter.v" Line 3: expected \';\' after \'4\'d0\'',
      'Process "Check Syntax" failed (1 error(s), 0 warning(s))',
    ],
    line: 3,
    clean: [
      'Started : "Check Syntax" of src/counter.v.',
      'Analyzing Verilog file "src/counter.v" into library work',
      'Elaborating module <counter>: 4 signals, 1 process.',
      'Process "Check Syntax" completed successfully',
    ],
  },
};
const warningsOf = (text) => text.split('\n').filter((l) => /^(WARNING|AVISO)\b/.test(l.trim())).map((l) => l.trim());

/** A session on a new project with the design's file empty. */
async function session(page, lang, title) {
  const name = `UsabHdl${lang}${title.replace(/\W+/g, '').slice(0, 12)}`;
  await makeProject(env, { name, files: { [DESIGNS[lang].file]: '' }, top: '' });
  await page.openProject(name);
  const s = new HdlSession(page, env, { file: FILE, title: `hdl edit: ${lang}: ${title}` });
  s.project = name;
  await s.open(DESIGNS[lang].file);
  return s;
}

/** Check Syntax as a step: its lines exactly. */
async function checkSyntax(s, want) {
  let got;
  await s.step('Check Syntax', {}, async () => { got = await s.a.checkSyntax(); }, { changes: false, expect: () => assert.deepEqual(got, want, `got ${JSON.stringify(got)}`) });
}

for (const lang of ['vhdl', 'verilog']) {
  const D = DESIGNS[lang], C = CHECK[lang];
  uiTest(`usability: hdl edit: ${lang}: a module typed from empty, a mistake found by Check Syntax and fixed at its line, Undo to the start and Redo; no warnings`, E, async (page) => {
    const s = await session(page, lang, 'typed');
    await s.typeDesign(lang);
    // the mistake: Check Syntax fails on it, its error in the Errors tab, in front
    await checkSyntax(s, C.failed);
    assert.equal(await s.a.consoleTab(), 'errors');
    assert.deepEqual(await s.a.errorRows(), [C.failed.find((l) => l.startsWith('ERROR'))]);
    // its row clicked: the editor at its line
    await s.step('click the error', {}, () => s.a.clickErrorRow(0), {
      changes: false,
      expect: async () => { const e = await editorState(page); assert.deepEqual([await page.eval(() => window.Silinx.active.id), e.line, e.focused], [`file:${D.file}`, C.line, true]); },
    });
    // fixed: the ';' typed at the end of the line it is missing from
    const before = s.doc;
    await s.step('fix', D.fix, async () => {
      for (let k = (await editorState(page)).line; k > D.fix.line; k--) await page.key('ArrowUp');
      await page.key('End');
      await s.a.typeLine(D.fix.type);
      s.model.endOf(D.fix.line);
      s.model.typeAll(D.fix.type);
    }, { expect: (text) => assert.equal(text, D.text) });
    await checkSyntax(s, C.clean);
    assert.deepEqual(await s.a.errorRows(), []);
    // Undo to the empty file, the fix undone first; Redo to the end
    await s.undoRedo({ first: before });
    // the file saved as typed, and no warning all along
    await page.waitFor(async (p, f, t) => (await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(f)}`)).text()) === t, [s.project, D.file, D.text], { what: 'the file saved', timeout: 15000 });
    assert.equal(await readWs(env, s.project, D.file), D.text);
    assert.deepEqual(warningsOf(await page.eval(() => window.__console())), []);
  }, { timeout: 240000 });
}

// the indentation the editor gives left as it is: each line where it was intended (VHDL: the block's, an 'end' back
// to its opening's; Verilog: an 'end' / 'endmodule' back to its block's as it is typed)
uiTest('usability: hdl edit: vhdl: the indentation the editor gives on Enter, left as it is, is the block\'s (#5218)', E, async (page) => {
  const s = await session(page, 'vhdl', 'indent as given');
  await s.typeDesign('vhdl', { strict: 'indent' });
}, { timeout: 120000 });

uiTest('usability: hdl edit: verilog: \'end\' and \'endmodule\' typed go back to their block\'s indentation (#5219)', E, async (page) => {
  const s = await session(page, 'verilog', 'indent as given');
  await s.typeDesign('verilog', { strict: 'indent' });
}, { timeout: 120000 });

// Enter at the end of a line whose last word is a whole keyword (then, begin, is): a new line, not the completion's
uiTest('usability: hdl edit: vhdl: Enter after a keyword typed whole makes the new line (#5220)', E, async (page) => {
  const s = await session(page, 'vhdl', 'enter after a keyword');
  await s.typeDesign('vhdl', { strict: 'enter' });
}, { timeout: 120000 });

// the console's line of Check Syntax's error clicked: the editor at its line, as the Errors tab's row does
uiTest('usability: hdl edit: vhdl: Check Syntax\'s error line in the console clicked goes to its line (#5221)', E, async (page) => {
  const D = DESIGNS.vhdl, C = CHECK.vhdl;
  const name = 'UsabHdlConsoleLink';
  await makeProject(env, { name, files: { [D.file]: D.text.replace('r <= r + 1;', 'r <= r + 1') }, top: 'counter' });
  await page.openProject(name);
  const s = new HdlSession(page, env, { file: FILE, title: 'hdl edit: vhdl: the console\'s error line' });
  await s.open(D.file);
  await checkSyntax(s, C.failed);
  // the error's line a link, its tooltip in the interface's language; the other lines none
  const links = await page.eval(() => [...document.querySelectorAll('#console-log .ln.mc-link')].map((l) => [l.textContent, l.title]));
  assert.deepEqual(links, [[C.failed[3], RUN.lang === 'pt' ? 'Abrir o ficheiro nesta linha' : 'Open the file at this line']]);
  assert.notEqual((await editorState(page)).line, C.line, 'the cursor elsewhere before the click');
  await s.step('click the console\'s error line', {}, () => s.a.clickConsoleLine(C.failed[3]), {
    changes: false,
    expect: async () => { const e = await editorState(page); assert.deepEqual([e.line, e.focused], [C.line, true]); },
  });
});

// the elaboration's line: one process, not "1 processes"
uiTest('usability: hdl edit: verilog: Check Syntax says "1 process" (#5222)', E, async (page) => {
  const D = DESIGNS.verilog;
  await makeProject(env, { name: 'UsabHdlPlural', files: { [D.file]: D.text }, top: 'counter' });
  await page.openProject('UsabHdlPlural');
  const s = new HdlSession(page, env, { file: FILE, title: 'hdl edit: verilog: one process' });
  await s.open(D.file);
  await checkSyntax(s, CHECK.verilog.clean);
  assert.ok(CHECK.verilog.clean.includes('Elaborating module <counter>: 4 signals, 1 process.'));
  assert.deepEqual(warningsOf(await page.eval(() => window.__console())), []);
});
