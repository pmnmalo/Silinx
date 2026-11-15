// UI: the Karnaugh map's place in its section (#3059): the map at the section's left (the options' left), its groups'
// legend right after it (beside it, centred on its cells, #3064, or just under it when there is no room), the minimal
// solutions' selector ("◀ Solution 1 of 2 ▶", no count, #3077) at the legend's top, above its groups; with 2 to 6
// inputs, one solution (no row) or several, SOP and POS, flat and in 3D, on a wide and a narrow screen. Its options
// (#3063): Order and 3D (Reset view) on one line; since #4057 the map, its options first, under its result's Hide K-map
// button at the same left (the SOP / POS groups its result's switch, no radio buttons).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable } from '../../core/logic.js';
import { showKmap, groupsOf } from './tt-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

/** Where the section's parts are: the options, the solutions' selector (null when none), the map, the legend, its first group. */
const place = (page) => page.eval((t) => {
  const host = document.querySelector(`${t} .tt-kmap-host`), r = (e) => e && e.getBoundingClientRect();
  const map = [...host.children].find((e) => !e.matches('.tt-sol, .tt-legend'));
  const box = (e) => e && { left: Math.round(r(e).left), right: Math.round(r(e).right), top: Math.round(r(e).top), bottom: Math.round(r(e).bottom) };
  // the map's cells: the flat map's frames (its labels left out), the 3D scene whole
  const frames = map?.matches('svg') ? [...map.querySelectorAll('.tt-k-frame')].map(r) : map ? [r(map)] : [];
  const cells = frames.length ? { top: Math.min(...frames.map((f) => f.top)), bottom: Math.max(...frames.map((f) => f.bottom)) } : null;
  return { cells, options: box(document.querySelector(`${t} .tt-groups`)), sol: box(host.querySelector('.tt-legend > .tt-sol')), solText: host.querySelector('.tt-sol')?.textContent ?? null, group: box(host.querySelector('.tt-legend > .tt-leg, .tt-legend > .hint')), map: box(map), mapClass: map?.getAttribute('class'), legend: box(host.querySelector(':scope > .tt-legend')) };
}, T);

/** The map at the section's left, the legend right after it; the solutions' selector (when there is one) its first line (#3077). */
function laidOut(p, what, several) {
  assert.ok(p.map, `${what}: a map`);
  assert.equal(!!p.sol, several, `${what}: the solutions' row ${several ? 'shown' : 'not shown'}`);
  if (p.sol) {
    assert.match(p.solText, /^◀Solution \d+ of \d+▶$/, `${what}: the selector alone, no count`);
    assert.ok(Math.abs(p.sol.top - p.legend.top) <= 1 && Math.abs(p.sol.left - p.legend.left) <= 1, `${what}: the selector (${JSON.stringify(p.sol)}) at the legend's top left (${JSON.stringify(p.legend)})`);
    assert.ok(p.group.top >= p.sol.bottom, `${what}: the groups (top ${p.group.top}) under the selector (bottom ${p.sol.bottom})`);
  }
  assert.ok(Math.abs(p.map.left - p.options.left) <= 1, `${what}: the map (left ${p.map.left}) at the section's left (${p.options.left})`);
  const beside = p.legend.left >= p.map.right - 1 && p.legend.top < p.map.bottom;
  const under = Math.abs(p.legend.left - p.options.left) <= 1 && p.legend.top >= p.map.bottom - 1 && p.legend.top - p.map.bottom <= 30;
  assert.ok(beside || under, `${what}: the legend right after the map (${JSON.stringify({ map: p.map, legend: p.legend })})`);
  // beside it, centred on its cells (#3064), unless taller than the map
  const mid = (b) => (b.top + b.bottom) / 2;
  if (beside && p.legend.bottom - p.legend.top < p.cells.bottom - p.cells.top) assert.ok(Math.abs(mid(p.legend) - mid(p.cells)) <= 2, `${what}: the legend (middle ${mid(p.legend)}) centred on the map's cells (${mid(p.cells)})`);
}

uiTest('#3059 #3077 Karnaugh map: at the section\'s left, the legend right after it, the minimal solutions\' selector its first line', E, async (page) => {
  const tables = {
    k2: { ...newTable('k2', ['a', 'b'], ['f']), table: { f: '0111' } },
    // g = m(0, 7) + d(1, 2, 4, 5, 6): two minimal SOPs; f one
    k3: { ...newTable('k3', ['a', 'b', 'c'], ['f', 'g']), table: { f: '1101X100', g: '1XX0XXX1' } },
    k4: { ...newTable('k4', ['a', 'b', 'c', 'd'], ['f']), table: { f: '1X0X01X1X0110X01' } },
    k5: { ...newTable('k5', ['a', 'b', 'c', 'd', 'e'], ['f']), table: { f: '10X11X0101X0011X10X11X0101X0011X' } },
    k6: { ...newTable('k6', ['a', 'b', 'c', 'd', 'e', 'h'], ['f']), table: { f: Array.from({ length: 64 }, (_, m) => (m % 3 ? '1' : '0')).join('') } },
  };
  const files = Object.fromEntries(Object.entries(tables).map(([k, v]) => [`src/${k}.bool.json`, JSON.stringify(v)]));
  await makeProject(env, { name: 'TtKmapLayout', files });
  await page.openProject('TtKmapLayout');
  const open = async (k) => {
    await page.eval((p) => window.SilinxApp.openTt(p), `src/${k}.bool.json`);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-kmap-res'), [`src/${k}.bool.json`], { what: k });
    await showKmap(page, T);   // (#4057)
  };
  const several = () => page.eval((t) => !!document.querySelector(`${t} .tt-kmap-host .tt-sol`), T);
  const tab = async (o) => { await page.eval((t, o) => document.querySelector(`${t} .tt-tab[data-out=${o}]`).click(), T, o); };
  const pos = (on) => groupsOf(page, T, on ? 'pos' : 'sop');   // (the K-map result's SOP / POS, #4057)
  const d3 = async () => {
    const on = !await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).checked, T);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);   // (narrow: the box may be under the drawer's edge)
    await page.waitFor((t, on) => !!document.querySelector(`${t} .tt-kmap-host > ${on ? '.tt-k3d' : 'svg.tt-kmap'}`) && !!document.querySelector(`${t} .tt-legend`), [T, on], { what: on ? '3D' : 'flat' });
  };

  for (const [w, h] of [[1400, 900], [760, 1000]]) {
    await page.setViewport(w, h);
    const at = `${w}px`;
    // the reported case: 3 inputs, g with two minimal solutions
    await open('k3');
    await tab('g');
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-kmap-host .tt-sol`), [T], { what: 'g\'s solutions' });
    laidOut(await place(page), `${at} 3 inputs, two solutions`, true);
    await pos(true); laidOut(await place(page), `${at} 3 inputs, POS`, await several());
    await d3(); const c = await place(page); laidOut(c, `${at} 3 inputs, POS, on a cylinder`, await several());
    assert.match(c.mapClass, /tt-ks-cylinder/, 'the cylinder, not the flat map');
    await d3(); await pos(false);
    await tab('f'); laidOut(await place(page), `${at} 3 inputs, one solution`, false);
    for (const k of ['k2', 'k4', 'k5', 'k6']) {
      await open(k);
      laidOut(await place(page), `${at} ${k}`, await several());
      if (k === 'k2') continue;
      await d3(); laidOut(await place(page), `${at} ${k} in 3D`, await several());
      await d3();   // (the 3D box left as it was found)
    }
  }
  await page.setViewport(1400, 900);
});

/** The options' lines: each a list of [left, top, bottom] of its parts, Order then 3D. */
const optionLines = (page) => page.eval((t) => {
  const parts = [...document.querySelector(`${t} .tt-groups`).children].map((e) => {
    const r = e.getBoundingClientRect();
    return { what: e.querySelector('input[type=radio]') ? 'radio' : e.querySelector('.tt-kmap-order') || e.matches('.tt-kmap-order') ? 'order' : e.querySelector('.tt-k3d-on') ? '3d' : e.matches('.tt-k3d-reset') ? 'reset' : e.tagName, left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
  const lines = [];
  for (const p of parts) { const l = lines.find((x) => p.top < x.bottom && p.bottom > x.top); if (l) { l.what.push(p.what); l.bottom = Math.max(l.bottom, p.bottom); } else lines.push({ what: [p.what], left: p.left, top: p.top, bottom: p.bottom }); }
  return lines;
}, T);

/** The K-map result's Hide K-map button, the options and the map (the flat map's svg or the 3D scene): their boxes; the options
 *  and the map in the result (#4057). */
const underButton = (page) => page.eval((t) => {
  const res = document.querySelector(`${t} .tt-results > .tt-kmap-res`), b = (e) => { const r = e.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const map = res.querySelector('.tt-kmap-host > :not(.tt-legend)');
  return { button: b(res.querySelector(':scope > .tt-kmap-on')), options: b(res.querySelector('.tt-kmap-box > .tt-groups')), map: b(map), radios: document.querySelectorAll(`${t} input[type=radio]`).length };
}, T);

uiTest('#3063 #4057 Karnaugh map: Order and 3D on one line (wide), the map under its result\'s Hide K-map button, at the same left', E, async (page) => {
  const tables = {
    k1: newTable('k1', ['a'], ['f']),
    k2: { ...newTable('k2', ['a', 'b'], ['f']), table: { f: '0111' } },
    k3: { ...newTable('k3', ['a', 'b', 'c'], ['f']), table: { f: '1XX0XXX1' } },
    k6: { ...newTable('k6', ['a', 'b', 'c', 'd', 'e', 'h'], ['f']), table: { f: Array.from({ length: 64 }, (_, m) => (m % 3 ? '1' : '0')).join('') } },
  };
  await makeProject(env, { name: 'TtKmapOptions', files: Object.fromEntries(Object.entries(tables).map(([k, v]) => [`src/${k}.bool.json`, JSON.stringify(v)])) });
  await page.openProject('TtKmapOptions');
  const open = async (k) => {
    await page.eval((p) => window.SilinxApp.openTt(p), `src/${k}.bool.json`);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-kmap-res'), [`src/${k}.bool.json`], { what: k });
    await showKmap(page, T);
  };
  // (Order then 3D: on one line when wide, no SOP / POS radio buttons above them any more, #4057; narrow: 3D may wrap,
  // at the same left; the options under the result's Hide K-map button, at its left, the map under the options at the same left)
  const two = async (l, rest, what, wide) => {
    assert.deepEqual(l.flatMap((x) => x.what), rest, `${what}: ${rest.join(', ')}`);
    if (wide) assert.equal(l.length, 1, `${what}: one line`);
    for (const x of l) assert.ok(Math.abs(x.left - l[0].left) <= 1, `${what}: each line at Order's left`);
    const u = await underButton(page);
    assert.equal(u.radios, 0, `${what}: no radio buttons`);
    assert.ok(u.options.top >= u.button.bottom - 1, `${what}: the options (top ${u.options.top}) under the Hide K-map button (bottom ${u.button.bottom})`);
    assert.ok(u.map.top >= u.options.bottom - 1, `${what}: the map (top ${u.map.top}) under the options (bottom ${u.options.bottom})`);
    assert.ok(Math.abs(l[0].left - u.button.left) <= 1 && Math.abs(u.map.left - u.button.left) <= 1, `${what}: Order (left ${l[0].left}) and the map (${u.map.left}) at the button's left (${u.button.left})`);
  };
  for (const [w, h] of [[1400, 900], [760, 1000]]) {
    await page.setViewport(w, h);
    await open('k1');
    assert.deepEqual((await optionLines(page)).flatMap((x) => x.what), [], `${w}px 1 input: no Order nor 3D`);
    await open('k2'); await two(await optionLines(page), ['order'], `${w}px 2 inputs`, w > 1000);
    await open('k3'); await two(await optionLines(page), ['order', '3d'], `${w}px 3 inputs`, w > 1000);
    await open('k6'); await two(await optionLines(page), ['order', '3d'], `${w}px 6 inputs`, w > 1000);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-k3d-reset`), [T], { what: 'Reset view' });
    await two(await optionLines(page), ['order', '3d', 'reset'], `${w}px 6 inputs in 3D`, w > 1000);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);   // (the 3D box left as it was found)
  }
  await page.setViewport(1400, 900);
});
