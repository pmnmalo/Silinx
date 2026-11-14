// UI: a transition's condition in the FSM editor in every notation of the logic operators (#3907): typed in the
// Properties panel (a.b', a·b, else, default) and in place on the drawing (/a + b / z=1: a '/' NOT and the outputs'
// '/'), kept as typed (the drawing's labels, the file), the HDL the same as from the C-style conditions (VHDL and
// Verilog: compiled, elaborated, no warnings), no problem in the console; a malformed condition's error with its
// column, two otherwise transitions an error, in English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm, generateFsm } from '../../core/fsm.js';
import { compile, elaborate } from '../../core/compile.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// A --t1--> B, A --t2--> C, B --t3--> A, B --t4--> C, C --t5--> A
const machine = (lang, conds, t2outs = {}) => normalizeFsm({
  name: 'nn', lang, inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 100, y: 300 }, { id: 'b', name: 'B', x: 500, y: 60, outputs: { z: '1' } }, { id: 'c', name: 'C', x: 500, y: 540 }],
  transitions: [['a', 'b'], ['a', 'c'], ['b', 'a'], ['b', 'c'], ['c', 'a']].map(([from, to], i) => ({ id: `t${i + 1}`, from, to, cond: conds[i], outputs: i === 1 ? t2outs : {} })),
  initial: 'a',
});
// (the generated code without its comments: they quote the drawing's conditions)
const code = (s) => s.split('\n').filter((l) => !/^\s*(--|\/\/)/.test(l)).map((l) => l.replace(/\s*(--|\/\/).*$/, '')).join('\n');

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmNotations${lang}`, hdl = `src/nn.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#3907 FSM: conditions in Boolean-algebra notation, words, else and default, typed in Properties and in place, kept; the ${lang === 'vhdl' ? 'VHDL' : 'Verilog'} of the C-style form`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/nn.fsm.json': JSON.stringify(machine(lang, ['a', '!a', 'b', '!b', '1']), null, 2) } });
    await page.openProject(pj);
    await page.eval(() => window.SilinxApp.openFsm('src/nn.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/nn.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
    const conds = () => page.eval(() => window.Silinx.active.fsmEditor.getModel().transitions.map((t) => t.cond));
    const setCond = async (id, text) => {
      await page.click(`${ED} [data-trans=${id}] .fsm-label`);
      await page.waitFor((ed, t) => document.querySelector(`${ed} [data-trans=${t}].sel`), [ED, id], { what: `${id} selected` });
      await page.waitForSelector(`${ED} .fsm-cond`);
      await page.fill(`${ED} .fsm-cond`, text);
    };
    const problems = () => page.eval(() => [...document.querySelectorAll('#console-errors .diag, #console-warnings .diag')].map((d) => d.textContent));

    // ---- in the Properties panel
    await setCond('t1', "a.b'");
    await setCond('t3', 'else');
    await setCond('t4', 'a·b');
    await setCond('t5', 'default');
    // ---- in place: a '/' NOT, then the outputs after the label's '/'
    await page.dblclick(`${ED} [data-trans=t2] .fsm-label`);
    await page.waitForSelector(`${ED} .fsm-inline`);
    await page.fill(`${ED} .fsm-inline`, '/a + b / z=1');
    await page.key('Enter');
    await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the text in place closed' });
    const typed = ["a.b'", '/a + b', 'else', 'a·b', 'default'];
    assert.deepEqual(await conds(), typed);
    assert.deepEqual(await page.eval(() => window.Silinx.active.fsmEditor.getModel().transitions[1].outputs), { z: '1' });
    // (the drawing's labels: as typed)
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-trans] .fsm-label`)].map((l) => l.textContent), ED), ["a.b'", '/a + b /z=1', 'else', 'a·b', 'default']);

    // ---- saved as typed; the HDL that of the C-style form, compiled and elaborated with no warnings; no problem
    const saved = await page.waitFor(async (p, h) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fnn.fsm.json`)).json();
      const c = await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text();
      return m.transitions[1].cond === '/a + b' && m.transitions[4].cond === 'default' && /Mealy/.test(c) && { m, c };
    }, [pj, hdl], { what: 'the diagram and its HDL saved', timeout: 15000 });
    assert.deepEqual(saved.m.transitions.map((t) => t.cond), typed);
    const ref = machine(lang, ['a && !b', '!a || b', '', 'a && b', ''], { z: '1' });
    assert.equal(code(saved.c), code(generateFsm(ref, lang).code));
    const lib = compile([{ path: hdl.slice(4), lang, text: saved.c }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(elaborate(lib, 'nn').diags.map((e) => `${e.severity}: ${e.message}`), [], lang);
    assert.deepEqual(await problems(), []);

    // ---- a malformed condition: its error, with the column
    await setCond('t1', 'a.b c');
    const bad = `ERROR:FSM - "src/nn.fsm.json": Transition A → B: the condition 'a.b c' is not valid (column 5: unexpected 'c' (an operator missing before it: a && b, a.b))`;
    await page.waitFor((w) => [...document.querySelectorAll('#console-errors .diag')].some((d) => d.textContent === w), [bad], { what: 'the error with its column' });
    assert.deepEqual(await problems(), [bad]);
    // ---- two otherwise transitions from B: an error, in English then in Portuguese
    await setCond('t1', "a.b'");
    await setCond('t4', 'true');
    const two = 'ERROR:FSM - "src/nn.fsm.json": State B has 2 otherwise transitions (else, default, true, 1 or no condition), to A, C; a state has one at most';
    await page.waitFor((w) => [...document.querySelectorAll('#console-errors .diag')].map((d) => d.textContent).join('|') === w, [two], { what: 'the otherwise error' });
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      const pt = 'O estado B tem 2 transições "caso contrário" (else, default, true, 1 ou sem condição), para A, C; um estado tem uma, no máximo';
      await page.waitFor((w) => [...document.querySelectorAll('#console-errors .diag')].some((d) => d.textContent.endsWith(`: ${w}`)), [pt], { what: 'the error in Portuguese' });
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  });
}
