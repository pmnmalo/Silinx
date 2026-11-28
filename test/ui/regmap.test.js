// UI (#5288): a register map made with New Source ▸ Register Map and edited in its editor. Its one register ctrl, then
// + Register (reg1 at 0x01, named count, 12 bits, read only: two bytes), the bus I²C at 0x42; saved: the map as the
// format has it, its HDL file generated (the I²C slave), the Design pane's row its Registers badge first, VHDL last; its check's
// error (two registers at one address) in the console's Errors, gone when fixed; the main toolbar's Undo; Header writes
// firmware/pwm_regs.h; in Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .regmap-editor';
const model = (page) => page.eval(() => window.Silinx.active.regsEditor.getModel());
const status = (page) => page.eval((ed) => document.querySelector(`${ed} .doc-status`)?.textContent, ED);
// a cell of a register's row changed as typed
const setCell = (page, reg, cls, value) => page.eval((ed, reg, cls, value) => {
  const el = document.querySelector(`${ed} .regs-row[data-name="${reg}"] .${cls}`);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, ED, reg, cls, value);
const waitFile = async (project, rel, ok) => {
  for (let t = Date.now(); Date.now() - t < 15000;) { try { if (ok(await readWs(env, project, rel))) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
  assert.fail(`${rel} not written`);
};

uiTest('#5288 a register map: New Source ▸ Register Map, + Register, I²C, saved with its HDL, its check, Undo, Header; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Regs', top: '' });
  await page.openProject('Regs');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'Register Map');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'pwm_regs');
  await page.dialogButton('Next >');
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].some((b) => b.textContent.trim() === 'Finish'), [], { what: 'Finish' });
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((ed) => document.querySelector(`${ed} .regs-row`), [ED], { what: 'the register map editor' });
  assert.deepEqual((await model(page)).registers, [{ name: 'ctrl', addr: 0, width: 8, access: 'rw', reset: 0 }]);
  assert.equal(await status(page), '1 register · 1 byte');
  // + Register: reg1 at 0x01; then count, 12 bits, read only
  await page.click(`${ED} .regs-add`);
  await page.waitFor((ed) => document.querySelector(`${ed} .regs-row[data-name="reg1"]`), [ED], { what: 'reg1' });
  await setCell(page, 'reg1', 'regs-name', 'count');
  await setCell(page, 'count', 'regs-width', '12');
  await page.eval((ed) => { const s = document.querySelector(`${ed} .regs-row[data-name="count"] .regs-access`); s.value = 'ro'; s.dispatchEvent(new Event('change', { bubbles: true })); }, ED);
  await page.eval((ed) => { const s = document.querySelector(`${ed} .regs-bus`); s.value = 'i2c'; s.dispatchEvent(new Event('change', { bubbles: true })); }, ED);
  const m = await model(page);
  assert.deepEqual([m.bus, m.address, m.registers], ['i2c', 0x42, [{ name: 'ctrl', addr: 0, width: 8, access: 'rw', reset: 0 }, { name: 'count', addr: 1, width: 12, access: 'ro' }]]);
  assert.equal(await status(page), '2 registers · 3 bytes');
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .regs-table th`)].map((x) => x.textContent), ED), ['Address', 'Name', 'Width', 'Access', 'Reset value', 'Strobe']);
  // its check's error: count at 0x00, on ctrl; in the console's Errors, gone when fixed
  const E2 = 'count and ctrl both at address 0';
  await setCell(page, 'count', 'regs-addr', '0');
  await page.waitFor((e) => window.SilinxApp.S.diags.some((d) => d.message === e), [E2], { what: 'the overlap in the Errors' });
  assert.deepEqual(await page.eval(() => window.SilinxApp.S.diags.filter((d) => d.tool === 'Register Map').map((d) => `${d.severity}: ${d.message}`)), [`error: ${E2}`]);
  // (Edit ▸ Undo: count at 0x01 again)
  await page.menu('Edit', 'Undo');
  await page.waitFor(() => window.Silinx.active.regsEditor.getModel().registers[1]?.addr === 1, [], { what: 'Undo' });
  await page.waitFor(() => !window.SilinxApp.S.diags.some((d) => d.tool === 'Register Map'), [], { what: 'no problems' });
  // saved (the autosave): the map, its HDL file (the I²C slave) and its Design row
  await waitFile('Regs', 'src/pwm_regs.regs.json', (t) => JSON.parse(t).bus === 'i2c');
  const saved = JSON.parse(await readWs(env, 'Regs', 'src/pwm_regs.regs.json'));
  assert.deepEqual([saved.format, saved.name, saved.address, saved.registers.length, saved.generatedFile], ['silinx-regmap', 'pwm_regs', 66, 2, 'src/pwm_regs.vhd']);
  await waitFile('Regs', 'src/pwm_regs.vhd', (t) => /I2C at the address 0x42/.test(t));
  assert.match(await readWs(env, 'Regs', 'src/pwm_regs.vhd'), /^entity pwm_regs is$/m);
  await page.waitFor(() => [...document.querySelectorAll('.tree li')].some((li) => /pwm_regs/.test(li.textContent) && /Registers/.test(li.textContent)), [], { what: 'the Design row' });
  assert.equal(await page.eval(() => { const li = [...document.querySelectorAll('.tree li')].find((x) => /pwm_regs/.test(x.textContent)); return [...li.querySelectorAll('.badge')].map((b) => b.textContent).join(' '); }), 'Registers VHDL');
  // Header: firmware/pwm_regs.h
  await page.click(`${ED} .regs-header`);
  await waitFile('Regs', 'firmware/pwm_regs.h', (t) => t.includes('#define PWM_REGS_I2C_ADDRESS 0x42'));
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.trim() === 'Wrote firmware/pwm_regs.h, the header of pwm_regs.regs.json.'), [], { what: 'the header\'s line' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .regs-add`)?.textContent === '+ Registo', [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .regs-table th`)].map((x) => x.textContent), ED), ['Endereço', 'Nome', 'Largura', 'Acesso', 'Valor de reset', 'Impulso']);
  assert.equal(await status(page), '2 registos · 3 bytes');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

// (#4688) a map on AXI4-Lite, a Zynq's PL seen by its PS: in a Board project on the Zybo Z7, its bus AXI4-Lite (its
// registers on words, its base 0x43C00000 shown), + Register a word on, its base changed and refused off a 4 KB window
// (said, then fixed), saved with its HDL (the AXI4-Lite slave), Header writes ps/pwm_regs.h; Portuguese
uiTest('#4688 a register map on AXI4-Lite: its words, its base address, its HDL the AXI4-Lite slave, Header in ps/; Portuguese', E, async (page) => {
  const map = { format: 'silinx-regmap', version: 1, name: 'pwm_regs', bus: 'spi', registers: [{ name: 'ctrl', addr: 0, width: 8, access: 'rw', reset: 0 }, { name: 'count', addr: 1, width: 12, access: 'ro' }] };
  await makeProject(env, { name: 'AxiRegs', template: 'empty', board: 'zybo-z7', files: { 'src/pwm_regs.regs.json': JSON.stringify(map, null, 2) } });
  await page.openProject('AxiRegs');
  await page.eval(async () => (await import('/js/drawings-regs.js')).openRegs('src/pwm_regs.regs.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .regs-row`), [ED], { what: 'the register map editor' });
  const bar = () => page.eval((ed) => { const q = (s) => document.querySelector(`${ed} ${s}`); return { base: q('.regs-base').hidden ? null : q('.regs-base').value, address: q('.regs-address').hidden ? null : q('.regs-address').value }; }, ED);
  assert.deepEqual(await bar(), { base: null, address: null });
  await page.eval((ed) => { const s = document.querySelector(`${ed} .regs-bus`); s.value = 'axi'; s.dispatchEvent(new Event('change', { bubbles: true })); }, ED);
  await page.waitFor(() => window.Silinx.active.regsEditor.getModel().bus === 'axi', [], { what: 'AXI4-Lite' });
  assert.deepEqual(await bar(), { base: '0x43C00000', address: null });
  let m = await model(page);
  assert.deepEqual([m.base, m.registers.map((r) => [r.name, r.addr])], [0x43C00000, [['ctrl', 0], ['count', 4]]]);
  await page.click(`${ED} .regs-add`);
  await page.waitFor((ed) => document.querySelector(`${ed} .regs-row[data-name="reg1"]`), [ED], { what: 'reg1' });
  assert.equal((await model(page)).registers[2].addr, 8);
  assert.equal(await status(page), '3 registers · 12 bytes');
  // its base off a 4 KB window: said in the Errors; fixed
  const setBase = (v) => page.eval((ed, v) => { const i = document.querySelector(`${ed} .regs-base`); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, ED, v);
  const E2 = 'the AXI base address \'0x43C10800\' is not a 4 KB window\'s in M_AXI_GP0\'s 0x40000000 to 0x7FFFFFFF';
  await setBase('0x43C10800');
  await page.waitFor((e) => window.SilinxApp.S.diags.some((d) => d.message === e), [E2], { what: 'the base in the Errors' });
  await setBase('0x43C10000');
  await page.waitFor(() => !window.SilinxApp.S.diags.some((d) => d.tool === 'Register Map'), [], { what: 'no problems' });
  // saved: the map, its HDL the AXI4-Lite slave
  await waitFile('AxiRegs', 'src/pwm_regs.regs.json', (t) => JSON.parse(t).base === 0x43C10000);
  await waitFile('AxiRegs', 'src/pwm_regs.vhd', (t) => /Bus {9}: AXI4-Lite slave/.test(t));
  // Header: ps/pwm_regs.h, its base
  await page.click(`${ED} .regs-header`);
  await waitFile('AxiRegs', 'ps/pwm_regs.h', (t) => t.includes('#define PWM_REGS_BASE 0x43C10000u'));
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.trim() === 'Wrote ps/pwm_regs.h, the header of pwm_regs.regs.json.'), [], { what: 'the header\'s line' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .regs-base-label`)?.textContent === 'Endereço base', [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .regs-bus option`)].find((o) => o.value === 'axi').textContent, ED), 'AXI4-Lite (PS do Zynq)');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  m = await model(page);
  assert.equal(m.registers.length, 3);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
