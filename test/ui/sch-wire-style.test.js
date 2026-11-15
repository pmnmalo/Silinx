// UI (#4081): the schematic editor's ⋮ menu's Wires choice: Direct, Orthogonal (the default, the technical drawing),
// Curved (core/wire-style.js). Its title and options, the ✓ on the schematic's style; Direct chosen: every wire a
// straight line from end to end (core/schcurve.js curveD with 'direct': the reference), its rectilinear path kept;
// Undo and Redo, the ✓ following; a wire drawn Direct by clicks, straight lines through the points clicked, from pin
// to pin, its path routed square between its ends (core/schpath.js routePath: the reference); Curved then Direct, a
// wire's own points kept; saved and opened again; the netlist (no warnings) and the HDL the same as the technical
// drawing's; the title, the options and the hints in Portuguese. The console's warnings asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';
import { routePath, wireGrid } from '../../core/schpath.js';
import { curveD, curveAbs } from '../../core/schcurve.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const openMenu = (page) => page.eval((ed) => { const b = document.querySelector(`${ed} .se-btn[data-act=more]`); if (b.getAttribute('aria-expanded') !== 'true') b.click(); }, ED);
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const P = (x, y) => ({ x, y });
const nets = nl => nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')).filter(s => s.includes(' ')).sort();
const warnings = page => page.console.filter(m => /^warn|^error/.test(m.type)).map(m => m.text);

// U1 at (80, 90): I (80, 100), O (160, 100); U2 at (280, 190): I (280, 200), O (360, 200); U3 at (280, 390): I (280,
// 400), O (360, 400). a -> U1 -> (W3, square) -> U2 -> y; b, z and U3 free
function design() {
  const doc = newDoc('ws', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 280, 190), inv('S3', 'U3', 280, 390));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 420, y: 200 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 60, y: 300 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 480, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(360, 200), P(420, 200)] },
    { id: 'W3', points: [P(160, 100), P(230, 100), P(230, 200), P(280, 200)] });
  return doc;
}
const NETS0 = ['S1.I port:P1', 'S1.O S2.I', 'S2.O port:P2'];
const at = (page, p) => page.eval((ed, x, y) => { const l = document.querySelector(`${ed} svg .sym`); const q = l.ownerSVGElement.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, p.x, p.y);
const getDoc = page => page.eval(() => window.Silinx.active.schEditor.getDoc());
// the wires as drawn: [id, 'poly' | the path's d]
const drawn = page => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .wire`)].map((g) => { const l = g.querySelector('.wline'); return [g.dataset.id, l.tagName === 'polyline' ? 'poly' : l.getAttribute('d')]; }), ED);
// the Wires choice: its title and options (the ✓ marked *), its tip
const choice = page => page.eval((ed) => {
  const g = document.querySelector(`${ed} .se-more-menu .se-wires`);
  return { items: [...g.children].map((e) => (e.getAttribute('aria-checked') === 'true' ? '*' : '') + e.textContent.replace('✓', '').trim()), roles: [...g.querySelectorAll('button')].map((b) => b.getAttribute('role')), title: g.title };
}, ED);
const pick = async (page, style) => { await openMenu(page); await page.click(`${ED} .se-wires [data-value=${style}]`); };
const styleIs = (page, s) => page.waitFor((x) => (window.Silinx.active.schEditor.getDoc().wireStyle ?? 'orthogonal') === x, [s], { what: `the wires ${s}` });

uiTest('#4081 schematic: the ⋮ menu\'s Wires: Direct, Orthogonal, Curved; Undo and Redo; a wire drawn Direct; the netlist and HDL the same; saved; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'WireStyle', files: { 'src/ws.sch.json': JSON.stringify(design()) } });
  await page.openProject('WireStyle');
  await page.eval(() => window.SilinxApp.openSch('src/ws.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'drawn' });
  const TIP = 'How the wires are drawn: straight from end to end, the technical drawing\'s horizontal and vertical lines, or smooth curves of any shape (the connections, the nets and the HDL the same)';
  // the choice, after Rearrange and before Wire crossings (#4101); Orthogonal (an older file: no wireStyle) ticked
  assert.deepEqual(await choice(page), { items: ['Wires', 'Direct', '*Orthogonal', 'Curved'], roles: ['menuitemradio', 'menuitemradio', 'menuitemradio'], title: TIP });
  assert.deepEqual((await drawn(page)).map((x) => x[1]), ['poly', 'poly', 'poly']);
  const doc0 = await getDoc(page);

  // Direct: every wire a straight line from end to end, its path kept; the menu left open, its ✓ moved
  await pick(page, 'direct');
  await styleIs(page, 'direct');
  const d1 = await getDoc(page);
  assert.deepEqual(await drawn(page), d1.wires.map((w) => [w.id, curveD(w, 'direct')]));
  assert.equal((await drawn(page))[2][1], 'M160,100 L280,200', 'W3: from U1.O straight to U2.I');
  assert.deepEqual(d1.wires.map((w) => w.points), doc0.wires.map((w) => w.points), 'the paths kept');
  assert.deepEqual((await choice(page)).items, ['Wires', '*Direct', 'Orthogonal', 'Curved']);
  assert.equal(await page.eval((ed) => !document.querySelector(`${ed} .se-more-menu`).hidden, ED), true, 'the menu still open');
  // Undo: Orthogonal again, the ✓ with it; Redo: Direct
  await page.click('#toolbar [data-cmd=undo]');
  await styleIs(page, 'orthogonal');
  assert.deepEqual((await drawn(page)).map((x) => x[1]), ['poly', 'poly', 'poly']);
  assert.deepEqual((await choice(page)).items, ['Wires', 'Direct', '*Orthogonal', 'Curved']);
  await page.click('#toolbar [data-cmd=redo]');
  await styleIs(page, 'direct');
  assert.deepEqual((await choice(page)).items, ['Wires', '*Direct', 'Orthogonal', 'Curved']);
  await page.key('Escape');

  // a wire drawn Direct by clicks: from b (60, 300) through (150, 360) to U3.I (280, 400): straight lines through the
  // points clicked, its path routed square between its ends; then from U3.O (360, 400) straight to z (480, 300)
  await page.click(`${ED} .se-btn[data-act=wire]`);
  await page.hover(await at(page, P(200, 450)));
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .hint`).textContent, ED), /^Add Wire \(direct\): click to start, click to add points the wire passes through/);
  const before = await getDoc(page);
  for (const p of [P(60, 300), P(150, 360)]) await page.click(await at(page, p));
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} svg path.wire-preview`)?.getAttribute('d').startsWith('M60,300 L150,360 L'), ED), true, 'previewed straight');
  await page.click(await at(page, P(280, 400)));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 4, [], { what: 'the wire clicked' });
  let w = (await getDoc(page)).wires.at(-1);
  assert.deepEqual(curveAbs(w), [P(150, 360)], 'through the point clicked');
  assert.deepEqual(w.points, routePath(wireGrid(before), P(60, 300), P(280, 400)), 'its path routed square between its ends');
  assert.equal(Object.fromEntries(await drawn(page))[w.id], 'M60,300 L150,360 L280,400');
  const before2 = await getDoc(page);
  for (const p of [P(360, 400), P(480, 300)]) await page.click(await at(page, p));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 5, [], { what: 'the second wire' });
  w = (await getDoc(page)).wires.at(-1);
  assert.deepEqual(curveAbs(w), [], 'pin to pin: no point of its own');
  assert.deepEqual(w.points, routePath(wireGrid(before2), P(360, 400), P(480, 300)));
  assert.equal(Object.fromEntries(await drawn(page))[w.id], 'M360,400 L480,300', 'a straight line from pin to pin');
  const d = await getDoc(page);
  assert.deepEqual(nets(netlist(d)), [...NETS0, 'S3.I port:P3', 'S3.O port:P4'].sort());
  assert.deepEqual(netlist(d).diagnostics, [], 'no warnings');
  // the HDL as the same schematic's in the technical drawing
  const square = { ...d, wireStyle: undefined, wires: d.wires.map((x) => ({ id: x.id, points: x.points })) };
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(d, { lang }), generateHdl(square, { lang }), lang);

  // the Select tool's hint, Direct's
  await page.click(`${ED} .se-btn[data-act=select]`);
  await page.hover(await at(page, P(200, 450)));
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .hint`).textContent, ED), /^Direct wires: click a wire, then drag the wire or its handles to bend it/);

  // Curved: the wires through the same points as curves; Direct again: straight lines through them
  await pick(page, 'curved');
  await styleIs(page, 'curved');
  assert.deepEqual(await drawn(page), (await getDoc(page)).wires.map((x) => [x.id, curveD(x)]));
  await pick(page, 'direct');
  await styleIs(page, 'direct');
  assert.equal(Object.fromEntries(await drawn(page))[d.wires[3].id], 'M60,300 L150,360 L280,400', 'its own point kept');
  await page.key('Escape');

  // saved: opened again Direct
  await page.eval(() => new Promise((r) => setTimeout(r, 800)));
  await page.eval(() => { const x = window.SilinxApp.findDoc('sch:src/ws.sch.json'); if (x) window.SilinxApp.closeDoc(x); });
  await page.waitFor((ed) => !document.querySelector(ed), [ED], { what: 'closed' });
  await page.eval(() => window.SilinxApp.openSch('src/ws.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'opened again' });
  assert.equal((await getDoc(page)).wireStyle, 'direct');
  assert.deepEqual((await choice(page)).items, ['Wires', '*Direct', 'Orthogonal', 'Curved']);

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .se-wires [data-value=direct]`)?.textContent.replace('✓', '').trim() === 'Direto', [ED], { what: 'Portuguese' });
  assert.deepEqual(await choice(page), { items: ['Fios', '*Direto', 'Ortogonal', 'Curvo'], roles: ['menuitemradio', 'menuitemradio', 'menuitemradio'],
    title: 'Como os fios são desenhados: a direito de ponta a ponta, as linhas horizontais e verticais do desenho técnico, ou curvas suaves de qualquer forma (as ligações, as redes e o HDL os mesmos)' });
  await page.hover(await at(page, P(200, 450)));
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .hint`).textContent, ED), /^Fios diretos: clique num fio e arraste o fio ou as suas pegas para o dobrar/);
  await page.click(`${ED} .se-btn[data-act=wire]`);
  await page.hover(await at(page, P(200, 460)));
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .hint`).textContent, ED), /^Adicionar Fio \(direto\): clique para começar/);
  await page.key('Escape');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
}, { timeout: 180000 });
