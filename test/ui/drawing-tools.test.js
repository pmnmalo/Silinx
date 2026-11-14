// UI (#3971): the state diagram's and the ASM chart's tools as the Petri net editor's: the select arrow the toolbar's
// first icon, pressed by default; an add tool kept pressed, a crosshair on the drawing, an element added at each click
// on its background (three one after another), until Escape or the arrow; a transition still drawn from a state's rim,
// a box clicked with an add tool getting the new box on its free exit; Try it back to the arrow; the tips in
// Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';

// the tools: [the arrow's data-act or the label, pressed, aria-pressed]; the canvas's crosshair (its cursor while an add
// tool is on; with the arrow the pointer's place decides: a state's rim, a crosshair too)
const tools = (page) => page.eval((d) => [...document.querySelectorAll(`${d} .draw-tool`)].map((b) => [b.dataset.act || b.textContent, b.classList.contains('active'), b.getAttribute('aria-pressed')]), D);
const adding = (page) => page.eval((d) => { const c = document.querySelector(`${d} .asm-canvas`); const on = c.classList.contains('adding'); return [on, on ? getComputedStyle(c).cursor : '']; }, D);
const pressed = (page) => page.eval((d) => [...document.querySelectorAll(`${d} .draw-tool.active`)].map((b) => b.dataset.act || b.textContent), D);
// a point of the drawing's background, nothing drawn under it (nor near it: `room` px), scanned from the top left
const blank = (page, room) => page.eval((d, rm, items) => {
  const r = document.querySelector(`${d} .asm-canvas`).getBoundingClientRect();
  const free = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.closest('.asm-canvas') && !e.closest(items); };
  for (let y = r.top + 40; y < r.bottom - 40; y += 10) for (let x = r.left + 40; x < r.right - 40; x += 10) {
    if ([[0, 0], [rm, 0], [-rm, 0], [0, rm], [0, -rm], [rm, rm], [-rm, -rm], [rm, -rm], [-rm, rm]].every(([a, b]) => free(x + a, y + b))) return { x, y };
  }
  return null;
}, D, room, '[data-state],[data-trans],[data-node],[data-edge],[data-port]');
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const setLang = (page, l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);

uiTest('#3971 the state diagram: the arrow first, the State tool kept pressed (three states), Escape and the arrow back to select; a transition drawn; Try it; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'ToolsFsm', template: 'traffic' });
  await page.setViewport(1440, 900);
  await page.openProject('ToolsFsm');
  await page.eval(() => window.SilinxApp.openFsm('src/traffic.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.fsmEditor?.fitted(), [], { what: 'the FSM editor' });
  const ed = () => page.eval(() => window.Silinx.active.fsmEditor.getModel());
  const n0 = (await ed()).states.length, t0 = (await ed()).transitions.length;
  // the arrow the toolbar's first button, pressed; the drawing's cursor not a crosshair
  assert.equal(await page.eval((d) => document.querySelector(`${d} .fsm-toolbar button`).dataset.act, D), 'select');
  assert.deepEqual(await tools(page), [['select', true, 'true'], ['State', false, 'false']]);
  assert.deepEqual(await adding(page), [false, '']);
  // the State tool: pressed, a crosshair; three clicks on the background, three states, the tool still pressed
  await page.click(`${D} .draw-tool`, { text: 'State' });
  assert.deepEqual(await tools(page), [['select', false, 'false'], ['State', true, 'true']]);
  assert.deepEqual(await adding(page), [true, 'crosshair']);
  for (let k = 1; k <= 3; k++) {
    await page.click(await blank(page, 45));
    await page.waitFor((c) => window.Silinx.active.fsmEditor.getModel().states.length === c, [n0 + k], { what: `state ${k}` });
    assert.deepEqual(await pressed(page), ['State'], `state ${k}: the tool still pressed`);
  }
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .fsm-inline')), null, 'no name typed in place');
  // a transition drawn from a state's rim with the State tool on: the transition, no state
  const added = (await ed()).states.slice(n0);
  const pos = (id) => page.eval((d, sid) => { const b = document.querySelector(`${d} [data-state="${sid}"] .fsm-circle`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 }; }, D, id);
  const a = await pos(added[0].id), b = await pos(added[1].id);
  const u = Math.hypot(b.x - a.x, b.y - a.y);
  await page.drag({ x: a.x + (b.x - a.x) / u * (a.r - 3), y: a.y + (b.y - a.y) / u * (a.r - 3) }, b);
  await page.waitFor((c) => window.Silinx.active.fsmEditor.getModel().transitions.length === c, [t0 + 1], { what: 'the transition drawn' });
  await page.key('Escape');   // (its condition's text in place closed)
  assert.equal((await ed()).states.length, n0 + 3);
  // Escape: back to the arrow; a click on the background now adds nothing
  await page.eval((d) => document.querySelector(`${d} .fsm-editor`).focus(), D);
  await page.key('Escape');
  assert.deepEqual(await tools(page), [['select', true, 'true'], ['State', false, 'false']]);
  assert.deepEqual(await adding(page), [false, '']);
  await page.click(await blank(page, 45));
  assert.equal((await ed()).states.length, n0 + 3);
  // the arrow: back to select too
  await page.click(`${D} .draw-tool`, { text: 'State' });
  await page.click(`${D} .fsm-toolbar [data-act=select]`);
  assert.deepEqual(await pressed(page), ['select']);
  // Try it: the arrow, the State tool disabled
  await page.click(`${D} .draw-tool`, { text: 'State' });
  await page.click(`${D} .fsm-tab-btn`, { text: 'Try it' });
  assert.deepEqual(await pressed(page), ['select']);
  assert.equal(await page.eval((d) => [...document.querySelectorAll(`${d} .draw-tool`)][1].disabled, D), true);
  await page.click(`${D} .fsm-tab-btn`, { text: 'Try it' });
  // the tips, in Portuguese
  const tips = () => page.eval((d) => [...document.querySelectorAll(`${d} .draw-tool`)].map((x) => x.title), D);
  assert.deepEqual(await tips(), ['Select and move (drag the background to pan, wheel to zoom)', 'Click the drawing to add a state (or double-click it)']);
  await setLang(page, 'pt');
  assert.deepEqual(await tips(), ['Selecionar e mover (arraste o fundo para deslocar, roda para zoom)', 'Clique no desenho para acrescentar um estado (ou faça duplo clique nele)']);
  await setLang(page, 'en');
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });

uiTest('#3971 the ASM chart: the arrow first, each add tool kept pressed (three boxes), a box clicked: the new one on its exit; Escape and the arrow back to select; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'ToolsAsm', template: 'blinky' });
  await page.setViewport(1440, 900);
  await page.openProject('ToolsAsm');
  await page.eval(() => window.SilinxApp.openFile('src/speed_ctrl.asm.json'));
  await page.waitFor((d) => window.Silinx.active?.asmEditor && document.querySelector(`${d} [data-node]`), [D], { what: 'the ASM editor' });
  await page.click(`${D} [data-act=fit]`);
  const model = () => page.eval(() => window.Silinx.active.asmEditor.getModel());
  const T = ['select', 'State', 'Decision', 'Case', 'Cond. output', 'Every cycle'];
  const only = (t) => T.map((x) => [x, x === t, String(x === t)]);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .asm-chart-toolbar button`).dataset.act, D), 'select');
  assert.deepEqual(await tools(page), only('select'));
  assert.deepEqual(await adding(page), [false, '']);
  // each add tool: three boxes of its type, one after another, the tool still pressed
  for (const [label, type] of [['State', 'state'], ['Decision', 'decision'], ['Cond. output', 'output']]) {
    await page.click(`${D} .draw-tool`, { text: label });
    assert.deepEqual(await tools(page), only(label));
    assert.deepEqual(await adding(page), [true, 'crosshair']);
    const n0 = (await model()).nodes.filter((n) => n.type === type).length;
    for (let k = 1; k <= 3; k++) {
      await page.click(await blank(page, 70));
      await page.waitFor((t, c) => window.Silinx.active.asmEditor.getModel().nodes.filter((n) => n.type === t).length === c, [type, n0 + k], { what: `${label} ${k}` });
      assert.deepEqual(await pressed(page), [label], `${label} ${k}: the tool still pressed`);
    }
    // (each one where it was clicked, unconnected)
    const fresh = (await model()).nodes.filter((n) => n.type === type).slice(n0).map((n) => n.id);
    assert.equal((await model()).edges.filter((e) => fresh.includes(e.to)).length, 0, `${label}: unconnected`);
  }
  // a box clicked with the State tool: a state on its free exit; the last decision's two exits, then none left
  const dec = (await model()).nodes.filter((n) => n.type === 'decision').at(-1).id;
  const at = (id) => page.eval((d, i) => { const r = document.querySelector(`${d} [data-node="${i}"] .asm-shape, ${d} [data-node="${i}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, D, id);
  await page.click(`${D} .draw-tool`, { text: 'State' });
  for (const port of ['true', 'false']) {
    await page.click(await at(dec));
    await page.waitFor((i, p) => window.Silinx.active.asmEditor.getModel().edges.some((e) => e.from === i && e.port === p), [dec, port], { what: `the ${port} exit` });
  }
  const n1 = (await model()).nodes.length;
  await page.click(await at(dec));
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.includes('This box has no free exit')), [], { what: 'no free exit, said' });
  assert.equal((await model()).nodes.length, n1);
  assert.deepEqual(await pressed(page), ['State']);
  // Escape: back to the arrow, a click on the background adds nothing
  await page.key('Escape');
  assert.deepEqual(await tools(page), only('select'));
  assert.deepEqual(await adding(page), [false, '']);
  await page.click(await blank(page, 70));
  assert.equal((await model()).nodes.length, n1);
  // the arrow: back to select too
  await page.click(`${D} .draw-tool`, { text: 'Case' });
  await page.click(`${D} .asm-chart-toolbar [data-act=select]`);
  assert.deepEqual(await pressed(page), ['select']);
  // the tips, in Portuguese
  const tips = () => page.eval((d) => [...document.querySelectorAll(`${d} .draw-tool`)].map((x) => x.title), D);
  await setLang(page, 'pt');
  assert.deepEqual(await tips(), [
    'Selecionar e mover (arraste o fundo para deslocar, roda para zoom)',
    'Clique no desenho para acrescentar uma caixa de estado (retângulo), ou numa caixa para a acrescentar na sua saída livre',
    'Clique no desenho para acrescentar uma caixa de decisão (losango), ou numa caixa para a acrescentar na sua saída livre',
    'Clique no desenho para acrescentar uma caixa de caso (decisão múltipla pelo valor de um sinal, p. ex. opcode), ou numa caixa para a acrescentar na sua saída livre',
    'Clique no desenho para acrescentar uma caixa de saída condicional (oval), ou numa caixa para a acrescentar na sua saída livre',
    'Clique no desenho para acrescentar um bloco de cada ciclo (lógica avaliada em todos os ciclos de relógio, em paralelo com os estados)',
  ]);
  await setLang(page, 'en');
  assert.deepEqual(warnings(page), []);
}, { timeout: 120000 });
