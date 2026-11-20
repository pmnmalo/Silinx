// UI (#4763): SSim's names drawn with the theme's colours: a row's line, a divider's text, a twisty, a group's count and a
// forced signal's F are the theme's variables (--wave-row-line…), dark in the dark theme, no longer a light grey drawn
// on a dark background; light again in the light theme. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the colour [r, g, b] of the names' canvas at (x, y) in CSS pixels, and the colours SSim read from the theme
const look = (page) => page.eval(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = document.querySelector('.doc:not([hidden]) .isim-names'), k = c.width / c.clientWidth;
  // the first row's line: 30 px of ruler, then 20 px a row, its line the row's last pixel
  const px = [...c.getContext('2d').getImageData(Math.round(2 * k), Math.round(49 * k), 1, 1).data.slice(0, 3)];
  const cs = getComputedStyle(c), v = (n) => cs.getPropertyValue(n).trim();
  ok({ px, vars: ['--wave-row-line', '--wave-divider-fg', '--wave-twisty', '--wave-count', '--wave-forced'].map(v) });
}))));
const lum = ([r, g, b]) => (r + g + b) / 3;

uiTest('#4763 SSim\'s names in the dark theme: their rows\' lines and marks the theme\'s, dark; light again in the light theme', E, async (page) => {
  await makeProject(env, { name: 'DarkNames', template: 'gates' });
  await page.openProject('DarkNames');
  await page.eval(() => window.SilinxApp.runSimulation('tb_gates'));
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_gates' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'SSim ran', timeout: 30000 });
  const setTheme = (t) => page.eval(async (x) => (await import('/js/silinx.js')).setTheme(x), t);
  await setTheme('light');
  const light = await look(page);
  assert.ok(lum(light.px) > 200, `a light row line: ${light.px}`);
  assert.ok(light.vars.every((x) => x), JSON.stringify(light.vars));
  await setTheme('dark');
  await page.waitFor(() => document.documentElement.dataset.theme === 'dark', [], { what: 'the dark theme' });
  const dark = await look(page);
  assert.ok(lum(dark.px) < 90, `a dark row line: ${dark.px}`);
  assert.notDeepEqual(dark.vars, light.vars);
  await setTheme('light');
  assert.deepEqual((await look(page)).px, light.px);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
