// UI: New Source ▸ XADC (analog inputs) ▸ Wizard (#5385). On a Basys 3 project (Artix-7): its page of the clock and the
// channels (DCLK the board's 100 MHz, the die temperature chosen; VAUX6 added as `pot`; CLKDIV and the rates said), its
// summary; the module written (the generator's own output, compiling and elaborating with no message), the Design pane's
// [XADC Wizard] base, reopened by its process; New Source has it only for a 7-series device; the pages in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { compile, elaborate } from '../../core/compile.js';
import { primitiveSources } from '../../core/unisim.js';
import { readWizardSpec } from '../../core/clocking.js';
import { xadcModule } from '../../core/xadc-wizard.js';
import { newSourceWizardOf } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const pageTitle = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const text = (page, sel) => page.eval((s) => document.querySelector(`.dlg-overlay ${s}`)?.textContent ?? null, sel);

uiTest('XADC Wizard on a Basys 3: the temperature and VAUX6 read, the module written and reopened; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'XwPj', board: 'basys3' });
  await page.openProject('XwPj');
  await newSourceWizardOf(page, 'XADC (analog inputs)', 'adc', 'XADC Wizard');
  assert.equal(await pageTitle(page), 'Clock and Channels');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .xw-mhz').value), '100');
  assert.equal(await text(page, '.xw-note'), 'ADCCLK 25 MHz (DCLK / 4): a conversion every 26 cycles, 961.5 kSPS in all, 961.5 kSPS a channel.');
  // VAUX6, its output pot
  await page.click('.dlg-overlay .xw-ch-on[data-ch="vaux6"]');
  await page.fill('.dlg-overlay .xw-ch-port[data-ch="vaux6"]', 'pot');
  await page.waitFor(() => /480\.8 kSPS a channel/.test(document.querySelector('.dlg-overlay .xw-note').textContent), [], { what: 'two channels' });
  // in Portuguese, this page
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Relógio e Canais', [], { what: 'Portuguese' });
  assert.equal(await text(page, '.xw-note'), 'ADCCLK 25 MHz (DCLK / 4): uma conversão a cada 26 ciclos, 961.5 kSPS ao todo, 480.8 kSPS por canal.');
  assert.ok((await page.eval(() => [...document.querySelectorAll('.dlg-overlay .xw-channels td')].map((t) => t.textContent))).includes('VAUX6 (entrada auxiliar)'));
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Summary', [], { what: 'Summary' });
  assert.match(await text(page, '.xw-summary'), /^The wizard will create src\/adc\.vhd \(VHDL\): the module adc, an XADC reading 2 channel\(s\)\.\n\nDCLK: clk, 100 MHz\ntemp: Die temperature\npot: VAUX6 \(auxiliary input\)\nReset: rst\nEOS: eos\nADCCLK 25 MHz/);
  await page.dialogButton('Finish');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'XADC Wizard'), [], { what: 'the wizard badge' });
  const code = await readWs(env, 'XwPj', 'src/adc.vhd');
  const spec = readWizardSpec(code);
  assert.deepEqual(spec.channels, [{ id: 'temp', port: 'temp' }, { id: 'vaux6', port: 'pot' }]);
  assert.equal(code, xadcModule(spec).code, 'the generator\'s own output');
  const src = [{ path: 'adc.vhd', lang: 'vhdl', text: code }];
  const lib = compile([...primitiveSources(src), ...src]);
  assert.deepEqual([...lib.errors, ...elaborate(lib, 'adc').diags].map((x) => x.message), []);
  // reopened by its process: its settings
  await page.treeRow('#procs', 'View/Edit XADC Wizard', { dbl: true });
  await page.waitDialog('XADC Wizard');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .xw-name').value), 'adc');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .xw-ch-port[data-ch="vaux6"]')?.value === 'pot', [], { what: 'its settings' });
  await page.dialogButton('Cancel');
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
