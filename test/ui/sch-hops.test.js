// UI (#692): Hop-overs: where two wires cross without connecting, the horizontal one hops over the other
// with a small arc; a T-junction keeps its dot; on by default (#756), Plain crossings remembered; the ⋮ menu's
// choice Wire crossings: Hop-overs, Plain crossings (#4101), its labels in Portuguese; printed as drawn; a view only
// (the document, its nets and its HDL the same).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, waitDownload } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
// the toolbar's menu opened (#2208), if it is not
const openMenu = (page) => page.eval((ed) => { const b = document.querySelector(`${ed} .se-btn[data-act=more]`); if (b.getAttribute('aria-expanded') !== 'true') b.click(); }, ED);
const P = (x, y) => ({ x, y });
// the choice Wire crossings (#4101): its title, its items (✓ on the chosen one: *), their tips
const choice = (page) => page.eval((ed) => {
  const g = document.querySelector(`${ed} .se-more-menu .se-crossings`), head = g.querySelector('.tb-menu-title');
  const items = [...g.querySelectorAll('.tb-menu-item')];
  return { title: [head.textContent, head.title], items: items.map((b) => `${b.getAttribute('aria-checked') === 'true' ? '*' : ''}${b.lastChild.textContent}`),
    roles: items.map((b) => b.getAttribute('role')), values: items.map((b) => b.dataset.value), tips: items.map((b) => b.title) };
}, ED);
const pick = (page, v) => page.click(`${ED} .se-crossings [data-value=${v}]`);
const TIPS = ['Draw a small arc where two wires cross without connecting', 'Draw two wires that cross without connecting straight across each other (a connection has its dot)'];

uiTest('#692 #756 #4101 schematic: Wire crossings: Hop-overs (on by default) draws an arc where two wires cross, a T keeps its dot; printed; Plain crossings remembered; in Portuguese; the document the same', E, async (page) => {
  const doc = newDoc('hops', 'vhdl');
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 200 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 200 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 250, y: 100 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 250, y: 300 },
    { id: 'P5', name: 'w', dir: 'out', width: 1, x: 350, y: 300 });
  // W1 a -> y crossed by W2 b -> z at (250, 200); W3 + W4 from y's side: a T at (350, 200) to w
  doc.wires.push({ id: 'W1', points: [P(100, 200), P(350, 200)] }, { id: 'W4', points: [P(350, 200), P(400, 200)] },
    { id: 'W2', points: [P(250, 100), P(250, 300)] }, { id: 'W3', points: [P(350, 200), P(350, 300)] });
  await makeProject(env, { name: 'HopsPj', files: { 'src/hops.sch.json': JSON.stringify(doc) } });
  await page.openProject('HopsPj');
  await page.eval(() => { try { localStorage.removeItem('xl.sch.hops'); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openSch('src/hops.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 5, [ED], { what: 'drawn' });
  const view = () => page.eval((ed) => ({
    hops: [...document.querySelectorAll(`${ed} svg .wire path.wline`)].map((p) => [p.closest('.wire').dataset.id, p.getAttribute('d')]),
    dots: [...document.querySelectorAll(`${ed} svg .junction`)].map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`),
  }), ED);
  const getDoc = () => page.eval(() => JSON.stringify(window.Silinx.active.schEditor.getDoc()));
  const doc0 = await getDoc();
  const HOP = { hops: [['W1', 'M100,200 L245,200 A5,5 0 0 1 255,200 L350,200']], dots: ['350,200'] };
  const PLAIN = { hops: [], dots: ['350,200'] };
  const reopen = async () => {
    await page.eval(() => { const d = window.SilinxApp.findDoc('sch:src/hops.sch.json'); if (d) window.SilinxApp.closeDoc(d); });
    await page.waitFor((ed) => !document.querySelector(ed), [ED], { what: 'closed' });
    await page.eval(() => window.SilinxApp.openSch('src/hops.sch.json'));
    await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 5, [ED], { what: 'drawn' });
  };
  // on by default (#756, nothing remembered): W1 hops over W2 at (250, 200); the T a dot, not a hop
  assert.deepEqual(await view(), HOP);
  assert.deepEqual(await choice(page), { title: ['Wire crossings', 'How two wires that cross without connecting are drawn'], items: ['*Hop-overs', 'Plain crossings'],
    roles: ['menuitemradio', 'menuitemradio'], values: ['hops', 'plain'], tips: TIPS }, 'Hop-overs ticked');
  assert.equal(await page.eval(() => localStorage.getItem('xl.sch.hops')), null, 'nothing stored');
  assert.equal(await getDoc(), doc0, 'the document the same');
  // printed: the SVG saved from the print preview has the arc and the T's dot
  await page.menu('File', 'Print…');
  await page.waitDialog('Print — Schematic');
  await page.dialogButton('Save SVG');
  const fs = await import('node:fs/promises');
  const svg = await fs.readFile(await waitDownload(page, 'Schematic_src_hops.sch.json.svg'), 'utf8');
  assert.match(svg, /d="M100,200 L245,200 A5,5 0 0 1 255,200 L350,200"/, 'the hop printed');
  assert.match(svg, /<circle[^>]*cx="350"[^>]*cy="200"/, 'the dot printed');
  await page.key('Escape');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .se-crossings [data-value=hops]`)?.lastChild.textContent === 'Saltos', [ED], { what: 'Portuguese' });
  assert.deepEqual(await choice(page), { title: ['Cruzamentos de fios', 'Como se desenham dois fios que se cruzam sem se ligarem'], items: ['*Saltos', 'Cruzamentos simples'],
    roles: ['menuitemradio', 'menuitemradio'], values: ['hops', 'plain'],
    tips: ['Desenhar um pequeno arco onde dois fios se cruzam sem se ligarem', 'Desenhar dois fios que se cruzam sem se ligarem a direito, um sobre o outro (uma ligação tem o seu ponto)'] });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // Plain crossings: plain lines, its ✓, remembered (the schematic opened again: still plain)
  await openMenu(page);
  await pick(page, 'plain');
  await page.waitFor((ed) => !document.querySelector(`${ed} svg .wire path.wline`), [ED], { what: 'no hops' });
  assert.deepEqual((await choice(page)).items, ['Hop-overs', '*Plain crossings']);
  assert.equal(await page.eval(() => localStorage.getItem('xl.sch.hops')), '0');
  assert.equal(await getDoc(), doc0);
  await reopen();
  assert.deepEqual(await view(), PLAIN, 'Plain crossings remembered');
  assert.deepEqual((await choice(page)).items, ['Hop-overs', '*Plain crossings']);
  // Plain crossings chosen again: nothing changes; Hop-overs again
  await openMenu(page);
  await pick(page, 'plain');
  assert.deepEqual(await view(), PLAIN);
  await pick(page, 'hops');
  await page.waitFor((ed) => document.querySelector(`${ed} svg .wire path.wline`), [ED], { what: 'the hop drawn' });
  assert.deepEqual(await view(), HOP);
  assert.deepEqual((await choice(page)).items, ['*Hop-overs', 'Plain crossings']);
  assert.equal(await page.eval(() => localStorage.getItem('xl.sch.hops')), '1', 'remembered');
  assert.equal(await getDoc(), doc0, 'the document the same');
  await page.eval(() => { try { localStorage.removeItem('xl.sch.hops'); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), [], 'no warnings');
});
