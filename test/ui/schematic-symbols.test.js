// UI (#4113): Settings ▸ Schematic Symbols (View ▸ in the ISE style interface): IEEE Std 91-1984's distinctive shapes
// by default, or IEC 60617-12's rectangles, kept in the browser. Chosen with a schematic open: its gates, inverters
// and buffers drawn again as boxes with their qualifiers (&, ≥1, =1, 1), the type under them, the palette's previews
// too; every pin where it was (the wires drawn the same, their ends on the pins), the document unchanged and not
// modified; the RTL schematic viewer's gates as boxes too; back to the distinctive shapes; the menu in Portuguese. No
// warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const warnings = (page) => page.console.filter((m) => /^warn|^error/.test(m.type)).map((m) => m.text);
const sym = (id, type, name, x, y) => ({ id, type, x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const P = (x, y) => ({ x, y });

// U1 an AND2, U2 a NOR2, U3 an inverter, U4 an XOR2 turned 90° (its type under it), and a wire
function design() {
  const doc = newDoc('gs', 'vhdl');
  doc.symbols.push(sym('S1', 'and2', 'U1', 100, 100), sym('S2', 'nor2', 'U2', 100, 260), sym('S3', 'inv', 'U3', 300, 120),
    { ...sym('S4', 'xor2', 'U4', 300, 260), rot: 90 });
  return doc;
}

/** Settings ▸ Schematic Symbols (View ▸ in the ISE style interface): its items [label, checked]; `pick` clicked. */
async function symbolsMenu(page, pick) {
  await page.closeMenus();
  const ise = await page.eval(() => document.documentElement.dataset.ui === 'ise');
  let items;
  if (ise) items = await page.openMenu((await page.eval(async () => (await import('/js/i18n.js')).getLanguage())) === 'pt' ? 'Ver' : 'View');
  else {
    await page.click('#settings-btn');
    await page.waitForSelector('body > .menu-popup .mi');
    items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup:not(.sub) > .mi .lbl')].map((l) => ({ label: l.textContent })));
  }
  const idx = items.findIndex((x) => /^(Schematic Symbols|Símbolos Esquemáticos)$/.test(x.label));
  assert.ok(idx >= 0, items.map((x) => x.label).join(' | '));
  // (after Boolean Notation)
  assert.match(items[idx - 1].label, /^(Boolean Notation|Notação Booleana)$/);
  await page.hover(await page.point(ise ? 'body > .menu-popup > .mi' : 'body > .menu-popup:not(.sub) > .mi', { index: idx }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi')].map((r) => [r.querySelector('.lbl').textContent, r.querySelector('.chk')?.textContent === '✓']));
  if (pick) await page.click('.menu-popup.sub .mi', { index: subs.findIndex(([l]) => l === pick) });
  else await page.closeMenus();
  return subs;
}

// the schematic as drawn: each symbol's boxes, distinctive shapes, qualifiers and type labels; the pins' leads' outer
// ends on the screen; the wires' points
const drawn = (page) => page.eval((ed) => {
  const svg = document.querySelector(`${ed} svg.se-svg`);
  const syms = [...svg.querySelectorAll('.sym[data-kind=sym]')].map((g) => ({
    id: g.dataset.id, rects: g.querySelectorAll('rect.gate').length, paths: g.querySelectorAll('path.gate').length,
    iec: [...g.querySelectorAll('.stype.iec')].map((t) => t.textContent), types: [...g.querySelectorAll('.stype:not(.iec)')].map((t) => `${t.textContent}${t.classList.contains('inside') ? ' inside' : ''}`),
    bubbles: g.querySelectorAll('circle.gate').length,
  }));
  const pins = [...svg.querySelectorAll('.sym[data-kind=sym] line.pin')].map((l) => {
    const m = l.getCTM(), p = svg.createSVGPoint();
    return [[l.x1.baseVal.value, l.y1.baseVal.value], [l.x2.baseVal.value, l.y2.baseVal.value]].map(([x, y]) => { p.x = x; p.y = y; const q = p.matrixTransform(m); return `${Math.round(q.x)},${Math.round(q.y)}`; });
  });
  const wires = [...svg.querySelectorAll('.wire .wline')].map((l) => l.getAttribute('points') || l.getAttribute('d'));
  const pv = [...document.querySelectorAll(`${ed} .se-pv`)].map((s) => s.querySelectorAll('rect.gate').length);   // (a multiplexer's, a flip-flop's too)
  return { syms, pins, wires, previews: pv.reduce((n, k) => n + k, 0) };
}, ED);

uiTest('#4113 Settings ▸ Schematic Symbols: IEEE by default; IEC chosen with a schematic open: boxes and qualifiers, the pins where they were, the file unchanged; the RTL viewer; Portuguese', E, async (page) => {
  // none set: IEEE Std 91-1984
  assert.equal(await page.eval(async () => {
    const s = await import('/js/symbol-standard.js');
    localStorage.removeItem(s.SYMBOL_STANDARD_KEY);
    return s.getSymbolStandard();
  }), 'ieee');
  const doc = design();
  doc.wires.push({ id: 'W1', points: [P(180, 120), P(300, 130)] });
  await makeProject(env, { name: 'GateSymbols', files: { 'src/gs.sch.json': JSON.stringify(doc) } });
  await page.openProject('GateSymbols');
  await page.eval(() => window.SilinxApp.openSch('src/gs.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym[data-kind=sym]`).length === 4, [ED], { what: 'drawn' });
  const doc0 = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  const ieee = await drawn(page);
  // the distinctive shapes: no box, the types inside (the XOR turned: under it)
  assert.deepEqual(ieee.syms.map(({ id, rects, iec }) => [id, rects, iec]), [['S1', 0, []], ['S2', 0, []], ['S3', 0, []], ['S4', 0, []]]);
  assert.ok(ieee.syms.every((s) => s.paths > 0));

  // ---- IEC 60617-12 chosen: drawn again
  assert.deepEqual(await symbolsMenu(page, 'IEC 60617-12 (rectangular)'), [['IEEE Std 91-1984 (distinctive shapes)', true], ['IEC 60617-12 (rectangular)', false]]);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .stype.iec`).length === 4, [ED], { what: 'the IEC boxes' });
  const iec = await drawn(page);
  assert.deepEqual(iec.syms, [
    { id: 'S1', rects: 1, paths: 0, iec: ['&'], types: ['AND2'], bubbles: 0 },
    { id: 'S2', rects: 1, paths: 0, iec: ['≥1'], types: ['NOR2'], bubbles: 1 },
    { id: 'S3', rects: 1, paths: 0, iec: ['1'], types: ['INV'], bubbles: 1 },
    { id: 'S4', rects: 1, paths: 0, iec: ['=1'], types: ['XOR2'], bubbles: 0 },
  ]);
  // every lead's outer end (its pin) where it was; the wires the same; the palette's gates as boxes
  assert.deepEqual(iec.pins.map((l) => l[0]), ieee.pins.map((l) => l[0]));
  assert.deepEqual(iec.wires, ieee.wires);
  assert.ok(iec.previews > ieee.previews, `the palette's gates as boxes: ${ieee.previews} then ${iec.previews}`);
  // the document: the same, not modified; the choice kept
  assert.deepEqual(await page.eval(() => window.Silinx.active.schEditor.getDoc()), doc0);
  assert.equal(await page.eval(() => !!window.Silinx.active.dirty), false);
  assert.equal(await page.eval(async () => localStorage.getItem((await import('/js/symbol-standard.js')).SYMBOL_STANDARD_KEY)), 'iec');
  assert.deepEqual(await symbolsMenu(page), [['IEEE Std 91-1984 (distinctive shapes)', false], ['IEC 60617-12 (rectangular)', true]]);

  // ---- the RTL schematic viewer: its gates as boxes with their qualifiers, the same size
  const rtl = await page.eval(async () => {
    const { compile, elaborate } = await import('/core/compile.js');
    const { buildSchematic } = await import('/core/schematic.js');
    const { mountSchematic } = await import('/js/schematic-view.js');
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 600px; height: 400px; z-index: 9999; background: white';
    document.body.append(host);
    const view = mountSchematic(host, {});
    const text = 'library ieee; use ieee.std_logic_1164.all;\nentity t is port (a, b : in std_logic; y, z : out std_logic); end t;\narchitecture rtl of t is begin y <= a nand b; z <= a xor b; end rtl;\n';
    await view.show(buildSchematic(elaborate(compile([{ path: 't.vhd', lang: 'vhdl', text }]), 't').top), { title: 't' });
    const look = () => ({ boxes: host.querySelectorAll('.k-gate rect.gate').length, shapes: host.querySelectorAll('.k-gate path.gate').length, q: [...host.querySelectorAll('.glabel.iec')].map((t) => t.textContent).sort() });
    const a = look();
    // (back to IEEE: drawn again)
    const s = await import('/js/symbol-standard.js');
    s.symbolsMenu().submenu[0].action();
    const b = look();
    s.symbolsMenu().submenu[1].action();
    const c = look();
    view.destroy(); host.remove();
    return [a, b, c];
  });
  assert.deepEqual(rtl, [{ boxes: 2, shapes: 0, q: ['&', '=1'] }, { boxes: 0, shapes: 3, q: [] }, { boxes: 2, shapes: 0, q: ['&', '=1'] }]);

  // ---- back to IEEE: the distinctive shapes again
  await symbolsMenu(page, 'IEEE Std 91-1984 (distinctive shapes)');
  await page.waitFor((ed) => !document.querySelector(`${ed} svg .stype.iec`), [ED], { what: 'the distinctive shapes' });
  assert.deepEqual(await drawn(page), ieee);
  assert.equal(await page.eval(() => !!window.Silinx.active.dirty), false);

  // ---- in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual(await symbolsMenu(page), [['IEEE Std 91-1984 (formas distintivas)', true], ['IEC 60617-12 (retangulares)', false]]);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(warnings(page), []);
});
