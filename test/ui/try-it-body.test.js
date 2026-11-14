// UI (#3924): the Try it's body a lighter green than its bar, in every drawing editor that has one: the panel of the state
// diagram (FSM), the ASM chart and the Petri net, and the schematic's side panel while it is tried out; in both interfaces
// and both themes (dark: a darker, muted green), its text readable (WCAG AA, 4.5:1); the FSM's Tables, the Petri net's
// Analysis and the schematic's Properties, outside Try it, not green. No message in the console.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newFsm } from '../../core/fsm.js';
import { newModel } from '../../core/asm.js';
import { newPetri } from '../../core/petri.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const DOC = '.doc:not([hidden])';
// an input wired to an output marker: a schematic Try it starts on
function schematic() {
  const doc = newDoc('s', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 300, y: 100 });
  doc.wires.push({ id: 'W1', points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] });
  return doc;
}
const EDITORS = [
  { kind: 'fsm', file: 'src/m.fsm.json', model: newFsm('m'), panel: '.fsm-panel', bar: '.asm-codebar', body: '.fsm-panel-body', api: 'fsmEditor', other: 'tables' },
  { kind: 'asm', file: 'src/c.asm.json', model: newModel('c'), panel: '.asm-simpanel', bar: '.asm-codebar', body: '.fsm-panel-body' },
  { kind: 'petri', file: 'src/n.pn.json', model: newPetri('n'), panel: '.pn-panel', bar: '.asm-codebar', body: '.pn-panel-body', api: 'petriEditor', other: 'analysis' },
  { kind: 'sch', file: 'src/s.sch.json', model: schematic(), panel: '.sch-editor', bar: '.se-simbar', body: '.se-props' },
];

/** The bar's and the body's backgrounds (the body's as painted: blended over what is behind it) and the lowest contrast
 *  of the body's text (each element with text of its own, on the background painted behind it). */
const look = (page, ed) => page.eval((doc, p, b, y) => {
  const rgba = (s) => {   // rgb(), rgba() or a color-mix()'s color(srgb r g b / a)
    const m = s.match(/rgba?\(([^)]+)\)/), c = s.match(/color\(srgb ([^)]+)\)/);
    if (c) { const [rgb, a = '1'] = c[1].split('/'); return [...rgb.trim().split(/\s+/).map((v) => Number(v) * 255), Number(a)]; }
    if (!m) return null;
    const [r, g, bl, a = 1] = m[1].split(',').map(Number); return [r, g, bl, a];
  };
  const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
  const painted = (el) => {   // the background behind el, its ancestors' blended from the page's white
    const chain = [];
    for (let e = el; e; e = e.parentElement) chain.unshift(e);
    return chain.reduce((acc, e) => { const c = rgba(getComputedStyle(e).backgroundColor); return c && c[3] ? over(c, acc) : acc; }, [255, 255, 255]);
  };
  const lum = (c) => { const [r, g, bl] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const contrast = (a, c) => { const [l1, l2] = [lum(a), lum(c)].sort((x, z) => z - x); return (l1 + 0.05) / (l2 + 0.05); };
  const root = document.querySelector(`${doc} ${p}`), bar = root.querySelector(y), body = root.querySelector(b), bs = getComputedStyle(body), ys = getComputedStyle(bar);
  let low = Infinity, what = '';
  for (const el of [body, ...body.querySelectorAll('*')]) {
    if (el.matches(':disabled') || !el.getClientRects().length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const c = contrast(over(rgba(getComputedStyle(el).color), painted(el)), painted(el));
    if (c < low) { low = c; what = `${el.className || el.tagName}: ${el.textContent.trim().slice(0, 30)}`; }
  }
  return { body: bs.backgroundColor, painted: painted(body).map(Math.round), barImage: ys.backgroundImage, barColor: ys.backgroundColor, cls: body.classList.contains('try-it-body'), low, what };
}, DOC, ed.panel, ed.body, ed.bar);
const messages = (page) => page.eval(() => ['#console-errors', '#console-warnings'].map((s) => [...document.querySelectorAll(`${s} .diag`)].map((r) => r.textContent)));
const green = ([r, g, b]) => g > r && g > b;

uiTest('#3924 the Try it\'s body a lighter green than its bar in the FSM, ASM, Petri net and schematic editors, light and dark', E, async (page) => {
  await page.setViewport(1600, 900);
  await makeProject(env, { name: 'TryBody', top: '', files: Object.fromEntries(EDITORS.map((e) => [e.file, JSON.stringify(e.model, null, 2)])) });
  await page.openProject('TryBody');
  const before0 = await messages(page);
  for (const ed of EDITORS) {
    await page.eval((f) => window.SilinxApp.openFile(f), ed.file);
    if (ed.kind === 'sch') {
      await page.waitFor((doc) => window.Silinx.active?.id === 'sch:src/s.sch.json' && document.querySelector(`${doc} .sch-editor .se-props`), [DOC], { what: 'the schematic editor' });
      assert.equal((await look(page, ed)).cls, false, 'sch: the Properties, outside Try it, not the Try it\'s body');
      await page.click(`${DOC} .se-btn[data-act=sim]`);
      await page.waitFor((doc) => document.querySelector(`${doc} .sch-editor`)?.classList.contains('sim-mode'), [DOC], { what: 'the schematic\'s Try it' });
    } else {
      await page.waitFor((doc) => document.querySelector(`${doc} .asm-toolbar`), [DOC], { what: `the ${ed.kind} editor` });
      await page.click(`${DOC} .asm-toolbar .asm-btn`, { text: 'Try it' });
      await page.waitFor((doc, p) => !document.querySelector(`${doc} ${p}`).hidden, [DOC, ed.panel], { what: `the ${ed.kind} Try it` });
    }
    // light: the body #eef8ee, lighter than the bar's gradient's mid point (#e7f5e7), its text AA
    let l = await look(page, ed);
    assert.equal(l.body, 'rgb(238, 248, 238)', `${ed.kind}: ${JSON.stringify(l)}`);
    assert.equal(l.barImage, 'linear-gradient(rgb(242, 251, 242), rgb(220, 239, 220))', `${ed.kind} bar`);
    assert.ok(l.cls && l.low >= 4.5, `${ed.kind} light, contrast ${l.low} (${l.what})`);
    // dark: a darker, muted green (#19241e) than the bar's, its text AA
    await page.eval(() => { document.documentElement.dataset.theme = 'dark'; });
    l = await look(page, ed);
    assert.equal(l.body, 'rgb(25, 36, 30)', `${ed.kind} dark: ${JSON.stringify(l)}`);
    assert.equal(l.barColor, 'rgba(76, 192, 107, 0.12)', `${ed.kind} dark bar`);
    assert.ok(green(l.painted) && l.painted.reduce((s, v) => s + v) < 3 * 80, `${ed.kind} dark: a dark green ${l.painted}`);
    assert.ok(l.low >= 4.5, `${ed.kind} dark, contrast ${l.low} (${l.what})`);
    await page.eval(() => { document.documentElement.dataset.theme = 'light'; });
    // the same panel showing the Tables (FSM) or the Analysis (Petri net): not the Try it's body
    if (ed.other) {
      await page.eval((api, w) => window.Silinx.active[api].showPanel(w), ed.api, ed.other);
      l = await look(page, ed);
      assert.ok(!l.cls && l.body !== 'rgb(238, 248, 238)', `${ed.kind} ${ed.other}: ${JSON.stringify(l)}`);
      await page.eval((api) => window.Silinx.active[api].showPanel('sim'), ed.api);
      assert.equal((await look(page, ed)).body, 'rgb(238, 248, 238)', `${ed.kind} Try it again`);
    }
    // the schematic's Try it stopped: its Properties plain again
    if (ed.kind === 'sch') {
      await page.click(`${DOC} .sch-editor .lv-exit`);
      await page.waitFor((doc) => !document.querySelector(`${doc} .sch-editor`).classList.contains('sim-mode'), [DOC], { what: 'Try it stopped' });
      l = await look(page, ed);
      assert.ok(!l.cls && l.body !== 'rgb(238, 248, 238)', `sch after Stop: ${JSON.stringify(l)}`);
    }
  }
  assert.deepEqual(await messages(page), before0);
});
