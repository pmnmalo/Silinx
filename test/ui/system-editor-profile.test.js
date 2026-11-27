// UI (#5910): the System editor offers the node tools its project's profile allows: an Embedded / SoC project's System no
// serial terminal nor MQTT broker (its profile allows design, circuit, FPGA and microcontroller nodes), a System project's
// every tool, the broker too; Wiring and back keeps them so. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newSystem } from '../../core/system-doc.js';
import { setupUi, uiTest, makeProject } from './harness.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const FILE = 'lab.sys.json';
const NODE_TOOLS = ['FPGA', 'Arduino Uno', 'Arduino Nano', 'Explorer 16/32', 'Pico', 'ESP32', 'MQTT Broker', 'Terminal', 'Circuit'];

// a System project of the profile `profile` opened, its System in the editor: the node tools it shows
async function nodeTools(page, name, profile) {
  await makeProject(env, { name, template: 'uart', files: { [FILE]: JSON.stringify(newSystem('lab'), null, 2) } });
  const pj = await env.server.api('GET', `/api/projects/${name}`);
  delete pj.fileTree; delete pj.kind;
  await env.server.api('PUT', `/api/projects/${name}`, { ...pj, profile, board: null, constraints: null, top: '' });
  await page.openProject(name);
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl')?.textContent.trim() === 'lab'), [], { what: 'the System\'s row' });
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  const shown = () => page.eval((ed, names) => [...document.querySelectorAll(`${ed} .asm-toolbar .asm-btn`)]
    .filter((b) => !b.hidden && b.getClientRects().length > 0).map((b) => b.textContent.trim()).filter((t) => names.includes(t)), ED, NODE_TOOLS);
  const first = await shown();
  // (Wiring hides the edit tools, back to the System shows them again: not the profile's others)
  await page.click(`${ED} .sys-wiring-btn`);
  await page.click(`${ED} .sys-wiring-btn`);
  assert.deepEqual(await shown(), first, 'the same tools after Wiring and back');
  return first;
}

uiTest('#5910 the System editor: an Embedded / SoC project\'s System has no Terminal nor MQTT Broker tool; a System project\'s has them', E, async (page) => {
  assert.deepEqual(await nodeTools(page, 'Emb', 'embedded'), ['FPGA', 'Arduino Uno', 'Arduino Nano', 'Explorer 16/32', 'Pico', 'ESP32', 'Circuit']);
  assert.deepEqual(await nodeTools(page, 'Sys', 'system'), NODE_TOOLS);
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.diags.filter((d) => d.severity === 'warning' || d.severity === 'error').map((d) => d.message)), []);
});
