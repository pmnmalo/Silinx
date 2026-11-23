// UI (#5288): the regs-avr example's System tried: Try it's 100 ms run says the SPI link's register accesses (its FPGA
// node's module, pwm_top, instances the slave of the map pwm_regs.regs.json): clear written, then duty written and
// count read every 47 ms or so, in the run's state and in the console's lines when the run stops (the link's
// transfers, then its accesses); no warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';

uiTest('#5288 regs-avr tried: its register accesses in the run and in the console', E, async (page) => {
  await makeProject(env, { name: 'CoRegs', template: 'regs-avr' });
  await page.openProject('CoRegs');
  await page.eval(() => window.SilinxApp.openFile('regs_avr.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'Try it' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 60000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.deepEqual(s.regs.map((r) => [r.link, r.map, r.accesses.map((a) => `${a.op} ${a.reg}`)]), [['spi', 'pwm_regs', ['write clear', 'write duty', 'read count', 'write duty', 'read count', 'write duty', 'read count']]]);
  const line = s.lines.find((l) => l.startsWith('spi (registers of pwm_regs): 7 access(es): write clear = 0x01; write duty = 0x00; read count → '));
  assert.ok(line, s.lines.join('\n'));
  // (in the console, when the run stops: the link's transfers, then its accesses)
  const spi = s.lines.find((l) => l.startsWith('spi (SPI uno → fpga, 125000 Hz mode 0): 17 transfer(s): MOSI 03 01 00 00 81 00 00 00 01 81'));
  assert.ok(spi, s.lines.join('\n'));
  await page.waitFor((w) => { const ls = [...document.querySelectorAll('#console-log .ln')].map((x) => x.textContent.trim()); const i = ls.indexOf(w[0]); return i >= 0 && ls[i + 1] === w[1] && /^Simulate System: paused at /.test(ls[i + 2] || ''); },
    [[`Simulate System: ${spi}`, `Simulate System: ${line}`]], { what: 'the transfers and the accesses in the console' });
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
