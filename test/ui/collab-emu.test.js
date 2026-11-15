// UI: a viewer follows the owner's Board Emulator (#4002, part 4), two participants in one test, in both interfaces: the
// owner opens the emulator (gates, on the Basys2): the viewer's own opens; the owner's switches (clicked) and a button
// (kept pressed, then let go) are the viewer's board's too, its LEDs the same; the owner pauses and changes the clock's
// rate: the viewer's emulator too; the viewer's own click on its board is browsing alone (the owner's next switch not
// followed). No warnings at either page.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
async function join(link, name) {
  const p = await env.newPage(env.server.url);
  await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await p.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await p.waitDialog('Follow a Shared Project');
  await p.fill('.dlg-overlay input[data-field=name]', name);
  await p.dialogButton('Follow');
  await p.waitFor(() => window.Silinx?.project?.name && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
  return p;
}
// the board: its switches and buttons on, its LEDs lit, running, its rate
const board = (page) => page.eval(() => {
  const v = window.SilinxApp.findDoc('emulator')?.view;
  if (!v?.inputElements) return null;
  const el = window.SilinxApp.findDoc('emulator').el;
  return { inputs: v.inputs, leds: [...el.querySelectorAll('.emu-led')].map((l) => l.style.background), running: v.running, speed: String(v.speed), powered: v.powered };
});
const same = async (page, fp, what) => {
  const want = await board(page);
  await fp.waitFor((w) => {
    const v = window.SilinxApp.findDoc('emulator')?.view;
    if (!v?.inputElements) return false;
    const el = window.SilinxApp.findDoc('emulator').el;
    return JSON.stringify({ inputs: v.inputs, leds: [...el.querySelectorAll('.emu-led')].map((l) => l.style.background), running: v.running, speed: String(v.speed), powered: v.powered }) === w;
  }, [JSON.stringify(want)], { what, timeout: 20000 });
  return want;
};
const settle = (page) => new Promise((r) => setTimeout(r, 600)).then(() => board(page));

uiTest('#4002 a viewer follows the owner\'s Board Emulator: its switches and a button, the LEDs, pause and rate; its own click browses alone', E, async (page) => {
  await makeProject(env, { name: 'GatesEmu', template: 'gates' });
  await page.openProject('GatesEmu');
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await join(link, 'Rui');
  try {
    await page.eval(async () => (await import('/js/viewers.js')).openEmulator('gates'));
    await page.waitFor(() => window.SilinxApp.findDoc('emulator')?.view?.outputs, [], { what: 'the owner\'s emulator', timeout: 60000 });
    await fp.waitFor(() => window.Silinx.active?.id === 'emulator' && window.SilinxApp.findDoc('emulator')?.view?.outputs, [], { what: 'the viewer\'s emulator', timeout: 60000 });
    const first = await same(page, fp, 'the same board');
    // the owner's switches: the viewer's too, its LEDs the same
    // (SW1 and SW0 on: 3, a prime, gates' LEDs lit)
    await page.click('.doc:not([hidden]) .emu-sw[title^="SW0 = "]');
    await page.click('.doc:not([hidden]) .emu-sw[title^="SW1 = "]');
    await settle(page);
    const two = await same(page, fp, 'two switches on');
    assert.equal(two.inputs.filter(Boolean).length, 2);
    assert.notDeepEqual(two.leds, first.leds, 'the switches changed the LEDs');
    // a button kept pressed (as Shift+click keeps it), then let go
    const press = () => page.eval(() => window.SilinxApp.findDoc('emulator').view.inputElements().find((e) => e.classList.contains('emu-btn')).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true })));
    await press();
    await settle(page);
    const pressed = await same(page, fp, 'a button pressed');
    assert.equal(pressed.inputs.filter(Boolean).length, 3);
    await press();
    await settle(page);
    assert.equal((await same(page, fp, 'the button let go')).inputs.filter(Boolean).length, 2);
    // the owner pauses, then changes the clock's rate
    await page.click('.doc:not([hidden]) .emu-bar button', { text: '⏸ Pause' });
    assert.equal((await same(page, fp, 'paused')).running, false);
    await page.eval(() => { const s = document.querySelector('.doc:not([hidden]) select.emu-speed'); s.value = '1000'; s.dispatchEvent(new Event('change')); });
    assert.equal((await same(page, fp, 'the rate')).speed, '1000');
    await page.click('.doc:not([hidden]) .emu-bar button', { text: '▶ Run' });
    assert.equal((await same(page, fp, 'running again')).running, true);
    // the viewer's own click on its board: browsing alone; the owner's next switch not followed
    await fp.click('.doc:not([hidden]) .emu-sw[title^="SW3 = "]');
    await fp.waitConsole(/^Browsing alone: Ana is no longer followed \(Follow Ana, in the toolbar, follows them again\)\.$/m);
    await page.click('.doc:not([hidden]) .emu-sw[title^="SW2 = "]');
    await new Promise((r) => setTimeout(r, 1000));
    const on = (p, n) => p.eval((k) => document.querySelector(`.doc:not([hidden]) .emu-sw[title^="SW${k} = "]`).classList.contains('on'), n);
    assert.deepEqual([await on(fp, 0), await on(fp, 1), await on(fp, 2), await on(fp, 3)], [true, true, false, true], 'its own switch, not the owner\'s next');
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
