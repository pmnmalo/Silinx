// Usability (#5206, phase 1): a module tested as a person tests it: the counter typed in hdl-edit.test.js
// (lib/hdl-designs.js), in VHDL and in Verilog; the Test Bench Wizard on it (Project ▸ New Source ▸ Test Bench, its
// pages: the clock and the reset it finds, random vectors, the expected values from the design), the bench passing in
// the simulator; its waves: zoomed in, the cursor clicked on them, a marker at the cursor, a signal of the counter added
// from the Objects panel, a radix changed, zoomed out to the full view, the wave configuration saved; the simulation
// run again, the configuration loaded and the window as it was saved. After every step the values the window shows at
// its cursor are the reference simulator's (core's, on the same files: lib/wave-kit.js); the consoles' lines exactly,
// no warnings. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from '../ui/harness.js';
import { newSourceWizardOf } from '../ui/new-source-helpers.js';
import { Session, RUN } from './lib/session.js';
import { DESIGNS } from './lib/hdl-designs.js';
import { tr } from './lib/hdl-actions.js';
import { waveKit, waveReference, waveActions } from './lib/wave-kit.js';

const FILE = 'test/usability/hdl-sim.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VECTORS = 16;
// each language: the bench's file, the counter's signal added (the VHDL's register r; the Verilog's q in the counter,
// its port: the bench's q, the row's path), the radix given to q, the simulator's lines of the bench's end
const SIM = {
  vhdl: { tb: 'sim/tb_counter.vhd', inner: 'r', added: 'tb_counter.uut.r', radix: ['Binary', 'bin'], passed: [`at 360 ns: Note: TEST PASSED: ${VECTORS} vector(s) (tb_counter.vhd:127)`] },
  verilog: { tb: 'sim/tb_counter.v', inner: 'q', added: 'tb_counter.q', radix: ['Decimal (Unsigned)', 'udec'], passed: [`TEST PASSED: ${VECTORS} vector(s)`, 'simulation finished ($finish) at 360 ns'] },
};
const warningsOf = (text) => text.split('\n').filter((l) => /^(WARNING|AVISO)\b/.test(l.trim())).map((l) => l.trim());

/** The Test Bench Wizard on the counter: its pages as a person goes through them. */
async function testBenchWizard(page, lang) {
  const L = await tr(page, ['Test Bench', 'Test Bench Wizard', 'Project', 'New Source…', 'New Source', 'Next >', 'Wizard >', 'File Name and Location',
    'Clock and Reset', 'Input Vectors', 'Vectors and Expected Outputs', 'Summary', 'Finish', 'Fill Expected from Current Design']);
  const [tbL, wizL, projL, itemL, dlgL, nextL, wizardL, fileL, clockL, vecL, expL, sumL, finishL, fillL] = L;
  await newSourceWizardOf(page, tbL, 'tb_counter', wizL, { menu: projL, item: itemL, dialog: dlgL, next: nextL, wizard: wizardL, file: fileL });
  const next = async (title) => {
    await page.dialogButton(title ? nextL : finishL);
    if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `the wizard's page ${title}` });
  };
  // the unit under test: the counter, the bench in the module's language
  await page.eval((l) => { const s = [...document.querySelectorAll('.dlg-overlay .wiz-main select')].find((x) => [...x.options].some((o) => o.value === l)); s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); }, lang);
  await next(clockL);
  // the clock and the reset it found: clk, rst
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay select')].slice(0, 2).map((s) => s.value)), ['clk', 'rst']);
  await next(vecL);
  await page.click('.dlg-overlay input[name=tbw-mode][value=random]');
  await page.fill('.dlg-overlay input[type=number]', String(VECTORS));
  await next(expL);
  await page.click('.dlg-overlay .btn', { text: fillL });
  await page.waitFor((n) => [...document.querySelectorAll('.dlg-overlay .tbw-exp')].filter((i) => i.value).length === n, [VECTORS], { what: 'the expected values filled in' });
  await next(sumL);
  await next(null);
  await page.waitNoDialog();
}

/** Simulate Behavioral Model on the bench, to its end: the simulator's view. */
async function simulate(page) {
  const [procL] = await tr(page, ['Simulate Behavioral Model']);
  await page.setView('sim');
  await page.treeRow('#hier', 'tb_counter');
  const n = await page.eval(() => window.__console().split('Launching SSim view').length);
  await page.treeRow('#procs', procL, { dbl: true, exact: true });
  await page.waitFor((k) => window.__console().split('Launching SSim view').length > k && /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view
    && !window.Silinx.active.view.state.running && /TEST (PASSED|FAILED)/.test(document.querySelector('.doc:not([hidden]) .isim-console')?.textContent || ''), [n], { what: 'the simulation run', timeout: 30000 });
  await sleep(300);
}

for (const lang of ['vhdl', 'verilog']) {
  const D = DESIGNS[lang], S = SIM[lang];
  uiTest(`usability: hdl sim: ${lang}: the Test Bench Wizard, the simulation, its waves zoomed, cursors, a signal added, a radix, the configuration saved and loaded; no warnings`, E, async (page) => {
    const name = `UsabSim${lang}`;
    await makeProject(env, { name, files: { [D.file]: D.text }, top: 'counter' });
    await page.openProject(name);
    if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
    // the bench made by the wizard: its line in the console (in the interface's language)
    await testBenchWizard(page, lang);
    const [made] = await tr(page, [`Test Bench Wizard: created ${S.tb} (${VECTORS} vector(s)) for 'counter' (selected in the Simulation view). Run Simulate Behavioral Model to check the design.`]);
    await page.waitConsole(new RegExp(`^${made.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    // the simulation: the bench passes; the reference, core's simulator on the same files, as long (1 us)
    await simulate(page);
    const files = [{ path: D.file, text: D.text }, { path: S.tb, text: await readWs(env, name, S.tb) }];
    const ref = waveReference(files, 'tb_counter', 1e6);
    const s = new Session(page, env, { file: FILE, title: `hdl sim: ${lang}`, hdl: false, kit: waveKit(ref) });
    await s.open();
    const { a } = s;
    const first = await a.isimLines();
    assert.deepEqual(first.slice(0, 5), ['SSim (Silinx behavioural simulator)', 'Time resolution is 1 ps', 'Simulator is doing circuit initialization process.', 'Finished circuit initialization process.', 'SSim> run 1 us']);
    assert.deepEqual(first.slice(5), S.passed);
    // the window: every signal of the bench, in their default radixes; the cursor at the end, where the bench stopped
    const ROWS = ref.rows.map((p) => [p, 'default']), Q = ROWS.findIndex(([p]) => p === 'tb_counter.q');
    assert.deepEqual(s.doc.rows, ROWS);
    assert.equal(s.doc.cursor, ref.now);
    // zoomed in about 200 ns (the ruler's context menu): twice as close, 200 ns where it was
    await s.step('zoom in', { at: 200000 }, async () => {
      await page.rightClick(await page.eval((t) => { const st = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-waves').getBoundingClientRect(); return { x: c.left + (t - st.t0) / st.scale, y: c.top + 15 }; }, 200000));
      const [z] = await tr(page, ['Zoom In']);
      await page.click('.isim-menu-item', { text: z });
    // (200 ns at the same pixel, within one: the click's point is a whole pixel)
    }, { expect: (d, b) => assert.ok(d.scale === b.scale / 2 && Math.abs((200000 - d.t0) / d.scale - 200000 / b.scale) <= 1, `scale ${d.scale}, t0 ${d.t0} (before: ${b.scale}, ${b.t0})`) });
    // the cursor clicked on q's waves near 150 ns (on one of its changes), a marker there; then on clk's near 260 ns
    await s.step('click the waves', { t: 150000, row: 'q' }, () => a.clickAt(150000, Q), { expect: (d) => assert.ok(Math.abs(d.cursor - 150000) < 20 * d.scale, `the cursor at ${d.cursor}`) });
    await s.step('marker at the cursor', {}, () => a.addMarkerAtCursor(), { expect: (d) => assert.deepEqual(d.markers, [d.cursor]) });
    await s.step('click the waves', { t: 260000, row: 'clk' }, () => a.clickAt(260000, 0), { expect: (d) => assert.ok(Math.abs(d.cursor - 260000) < 20 * d.scale, `the cursor at ${d.cursor}`) });
    // a signal of the counter added, from the Objects panel
    await s.step('add a signal', { instance: 'uut', signal: S.inner }, () => a.addSignal('uut', S.inner), { expect: (d) => assert.deepEqual(d.rows, [...ROWS, [S.added, 'default']]) });
    // q's radix
    await s.step('radix', { row: 'q', radix: S.radix[0] }, () => a.radix(Q, 250000, S.radix[0]), { expect: (d) => assert.equal(d.rows[Q][1], S.radix[1]) });
    // the full view again
    await s.step('zoom to full view', {}, () => a.zoomFull(), { expect: (d) => assert.deepEqual([d.fit, d.t0], [true, 0]) });
    // the configuration saved, next to the bench
    const saved = s.doc;
    await s.step('save the wave configuration', {}, () => a.saveConfig(), {
      changes: false,
      expect: async () => assert.equal((await a.isimLines()).at(-1), (await tr(page, ['Wave configuration saved to sim/tb_counter.wcfg']))[0]),
    });
    assert.match(await readWs(env, name, 'sim/tb_counter.wcfg'), /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<wave_config>/);
    // the simulation run again: the window as the bench has it
    await s.step('simulate again', {}, () => simulate(page), { expect: (d) => assert.deepEqual([d.rows, d.markers, d.cursor], [ROWS, [], ref.now]) });
    // the configuration loaded: the rows, their radixes and the marker as saved
    await s.step('load the wave configuration', {}, () => a.loadConfig(), {
      expect: async (d) => {
        assert.deepEqual([d.rows, d.markers], [saved.rows, saved.markers]);
        assert.equal((await a.isimLines()).at(-1), (await tr(page, [`Wave configuration sim/tb_counter.wcfg loaded: ${saved.rows.length} signals, 1 marker`]))[0]);
      },
    });
    // the cursor on the marker's change again: the values there, in the radixes loaded
    await s.step('click the waves', { t: saved.markers[0], row: 'q' }, () => a.clickAt(saved.markers[0], Q), { expect: (d) => assert.equal(d.cursor, saved.markers[0]) });
    assert.deepEqual(warningsOf(await page.eval(() => window.__console())), []);
  }, { timeout: 180000 });
}

// in Portuguese: the application's lines of the wizard and of the wave configuration in Portuguese too (#5223), in the
// simulator's console and in the Console (its copy of the simulator's, the Tasks interface's); drawn in English again
// when the language changes
uiTest('usability: hdl sim: the Test Bench Wizard\'s and the wave configuration\'s lines in Portuguese (#5223)', E, async (page) => {
  const D = DESIGNS.vhdl, S = SIM.vhdl;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await makeProject(env, { name: 'UsabSimPt', files: { [D.file]: D.text }, top: 'counter' });
  await page.openProject('UsabSimPt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await testBenchWizard(page, 'vhdl');
  await page.waitConsole(new RegExp(`^${esc(`Assistente de Bancada de Teste: criou ${S.tb} (${VECTORS} vetor(es)) para 'counter' (selecionada na vista Simulação). Execute Simular Modelo Comportamental para verificar o projeto.`)}$`, 'm'));
  await simulate(page);
  const a = waveActions(page);
  await a.addMarkerAtCursor();
  await a.saveConfig();
  const SAVED = 'Configuração de formas de onda guardada em sim/tb_counter.wcfg';
  await page.waitFor((l) => [...document.querySelectorAll('.doc:not([hidden]) .isim-console .isim-ln')].pop()?.textContent === l, [SAVED], { what: 'the saved line' });
  await a.loadConfig();
  const n = await page.eval(() => window.Silinx.active.view.state.rows.filter((r) => r.kind === 'sig').length);
  const LOADED = `Configuração de formas de onda sim/tb_counter.wcfg carregada: ${n} sinais, 1 marcador`;
  await page.waitFor((l) => [...document.querySelectorAll('.doc:not([hidden]) .isim-console .isim-ln')].pop()?.textContent === l, [LOADED], { what: 'the loaded line' })
    .catch(async (e) => { throw new Error(`${e.message}\n${(await a.isimLines()).slice(-4).join('\n')}`); });
  assert.deepEqual((await a.isimLines()).slice(-2), [SAVED, LOADED]);
  const text = await page.eval(() => window.__console());
  if (await page.eval(() => document.documentElement.dataset.ui) !== 'ise') for (const l of [SAVED, LOADED]) assert.ok(text.split('\n').includes(l), `the Console's copy: ${l}`);
  assert.ok(!/Test Bench Wizard: created|Wave configuration (saved|sim\/)/.test(text), 'no English line of theirs');
  assert.deepEqual(warningsOf(text), []);
  // the language changed: drawn again in English, then in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await a.isimLines()).slice(-2), ['Wave configuration saved to sim/tb_counter.wcfg', `Wave configuration sim/tb_counter.wcfg loaded: ${n} signals, 1 marker`]);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.deepEqual((await a.isimLines()).slice(-2), [SAVED, LOADED]);
}, { skip: RUN.lang !== 'pt' && 'in Portuguese only (SILINX_USABILITY_LANG=pt)', timeout: 180000 });
