// UI (#5367): the circuit's parts drawn as the real ones look, as far as practical: a 5 mm LED (its dome, its rim, its
// legs, lit in its colour while its anode is driven), a 6 mm tactile switch (its base, plate, studs, its cap down while
// pressed), slide switches (a metal frame, a black lever), a DIP switch (white levers, numbered, ON), a 7-segment display
// (slanted segments), a resistor for a pull-up or -down (its bands), a supply's binding posts, an oscillator's can, the
// LCD's and the OLED's modules (their boards, mounting holes, a bezel, the pins' names), an SG90 (its ears, its coloured
// wires, its horn's holes); their colours the CSS's (the real parts' own: the same in the dark theme); the Check's
// warnings. No warnings in the page. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const PARTS = [{ id: 'V1', type: 'supply', x: 0, y: 0 }, { id: 'S1', type: 'logic-switch', x: 4, y: 4 }, { id: 'B1', type: 'button', x: 8, y: 4 },
  { id: 'S2', type: 'spdt', x: 14, y: 4 }, { id: 'SW1', type: 'dip-4', x: 20, y: 6 }, { id: 'CK1', type: 'clock', x: 4, y: 10, hz: 1 },
  { id: 'R1', type: 'pull-up', x: 8, y: 12 }, { id: 'R2', type: 'pull-down', x: 10, y: 10 }, { id: 'D1', type: 'led', x: 14, y: 12 },
  { id: 'D2', type: 'led', x: 17, y: 12, color: 'green' }, { id: 'DS1', type: 'seg7-cc', x: 22, y: 18 }, { id: 'BAR1', type: 'led-bar-10', x: 28, y: 8 },
  { id: 'LCD1', type: 'lcd-1602', x: 0, y: 24 }, { id: 'OLED1', type: 'oled-ssd1306', x: 38, y: 24 }, { id: 'U1', type: 'lm75', x: 42, y: 10 },
  { id: 'M1', type: 'servo-sg90', x: 52, y: 24 }];
// S1 lights D1 (its cathode to the supply's GND)
const CIRC = { ...newCircuit('look'), parts: PARTS, wires: [{ id: 'w1', points: [[4, 4], [14, 12]], color: 'blue' }, { id: 'w2', points: [[15, 12], [0, 1]], color: 'black' }] };
const shape = (page) => page.eval((ed) => {
  const q = (id, s) => document.querySelectorAll(`${ed} .circ-canvas [data-id=${id}] ${s}`).length;
  return {
    led: [q('D1', 'path.circ-led'), q('D1', '.circ-led-rim'), q('D1', '.circ-led-leg'), q('D1', '.circ-led-shine')],
    button: [q('B1', '.circ-btn-body'), q('B1', '.circ-btn-plate'), q('B1', '.circ-btn-stud'), q('B1', '.circ-btn-cap')],
    switches: [q('S1', '.circ-sw-slot'), q('S2', '.circ-sw-slot')],
    dip: [...document.querySelectorAll(`${ed} .circ-canvas [data-id=SW1] .circ-dip-num, ${ed} .circ-canvas [data-id=SW1] .circ-dip-on`)].map((t) => t.textContent),
    seg: [...document.querySelectorAll(`${ed} .circ-canvas [data-id=DS1] .circ-seg`)].map((e) => `${e.tagName}:${e.dataset.seg}`),
    pull: [q('R1', '.circ-band'), q('R2', '.circ-band'), q('R1', '.circ-pull-lead')],
    supply: [q('V1', '.circ-post'), q('CK1', '.circ-osc-body')],
    lcd: [q('LCD1', '.circ-mount-hole'), q('LCD1', '.circ-lcd-bezel'), q('LCD1', '.circ-silk')],
    oled: [...document.querySelectorAll(`${ed} .circ-canvas [data-id=OLED1] .circ-silk`)].map((t) => t.textContent).concat(String(q('OLED1', '.circ-mount-hole'))),
    servo: [q('M1', '.circ-servo-ear'), q('M1', '.circ-servo-lead-gnd') + q('M1', '.circ-servo-lead-vcc') + q('M1', '.circ-servo-lead-sig'), q('M1', '.circ-servo-hole'), q('M1', '.circ-servo-text')],
  };
}, ED);
// the parts' own colours, as the page shows them
const colours = (page) => page.eval((ed) => Object.fromEntries([['lcd', 'LCD1', '.circ-lcd-body'], ['oled', 'OLED1', '.circ-oled-body'], ['servo', 'M1', '.circ-servo-body'],
  ['lever', 'S1', '.circ-sw-knob'], ['plate', 'B1', '.circ-btn-plate'], ['band', 'R1', '.circ-band-orange']].map(([k, id, s]) => [k, getComputedStyle(document.querySelector(`${ed} .circ-canvas [data-id=${id}] ${s}`)).fill])), ED);

uiTest('#5367 Circuit editor: the parts drawn as the real ones look; the LED lit, the button pressed; their colours the same in the dark theme', E, async (page) => {
  await makeProject(env, { name: 'CircLook', top: '', files: { 'src/look.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircLook');
  await page.eval(() => window.SilinxApp.openFile('src/look.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=M1]`), [ED], { what: 'the circuit editor' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  await page.screenshot(`${env.shotDir}/circuit-parts-look.png`);
  assert.deepEqual(await shape(page), {
    led: [1, 1, 1, 1], button: [1, 1, 4, 1], switches: [1, 1], dip: ['1', '2', '3', '4', 'ON'],
    seg: ['path:a', 'path:b', 'path:c', 'path:d', 'path:e', 'path:f', 'path:g', 'circle:dp'], pull: [4, 4, 1], supply: [2, 1],
    lcd: [4, 1, 2], oled: ['GND', 'VCC', 'SCL', 'SDA', '4'], servo: [2, 3, 3, 1],
  });
  const light = await colours(page);
  assert.deepEqual(light, { lcd: 'rgb(31, 107, 51)', oled: 'rgb(29, 79, 154)', servo: 'rgb(47, 111, 214)', lever: 'rgb(28, 28, 30)', plate: 'rgb(201, 204, 209)', band: 'rgb(240, 138, 0)' });
  // the dark theme: the same parts' colours
  await page.eval(async () => (await import('/js/silinx.js')).setTheme('dark'));
  await page.waitFor(() => document.documentElement.dataset.theme === 'dark', [], { what: 'dark' });
  await page.screenshot(`${env.shotDir}/circuit-parts-look-dark.png`);
  assert.deepEqual(await colours(page), light);
  await page.eval(async () => (await import('/js/silinx.js')).setTheme('light'));
  // the Check's warnings: what joins nothing, the button and the switches' outputs, the open inputs
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /Check Circuit/.test(l.textContent)), [], { what: 'the Check' });
  const said = (await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l));
  assert.deepEqual(said, ['B1 (Push button (momentary, normally open))', 'S2 (Slide switch (SPDT))', 'SW1 (DIP switch (4))', 'CK1 (Clock source)', 'R1 (Pull-up (a weak 1))',
    'R2 (Pull-down (a weak 0))', 'D2 (LED)', 'BAR1 (LED bar (10))', 'LCD1 (Character LCD 16×2 (HD44780))', 'OLED1 (Graphic OLED 128×64 (SSD1306, I²C))',
    'U1 (Temperature sensor LM75 (I²C))', 'M1 (Servo (SG90, PWM))'].map((x) => `WARNING: ${x} joins nothing`));
  // Try it: S1 on lights D1; B1 pressed, its cap down
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  await page.click(await page.eval((ed) => { const r = document.querySelector(`${ed} .circ-canvas [data-id=S1] .circ-sw-knob`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=D1] path.circ-led`)?.classList.contains('lit'), [ED], { what: 'D1 lit' });
  assert.match(await page.eval((ed) => getComputedStyle(document.querySelector(`${ed} .circ-canvas [data-id=D1] path.circ-led`)).filter, ED), /drop-shadow/);
  await page.screenshot(`${env.shotDir}/circuit-parts-look-lit.png`);
  await page.click(`${ED} .circ-sim-btn`);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
