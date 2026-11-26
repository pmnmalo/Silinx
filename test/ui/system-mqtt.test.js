// UI (#5500): network links and an MQTT broker in the System editor. Its MQTT Broker tool and a Pico W's MQTT interface
// (its board's, its + MQTT when it has none); a System of two Pico Ws and a broker, linked: Try it runs them (rp2040js
// on MicroPython, #5494), the broker's view (a terminal's: each message) shows b's publication reaching a, a's console its
// callback's print; a line typed to the broker's view published to a. Portuguese; both interfaces. The firmware's files
// from the tests' shared folder (SILINX_RP2040_CACHE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const SYS = JSON.stringify({ format: 'silinx-system', version: 2, name: 'net', nodes: [
  { id: 'a', kind: 'mcu', board: 'pico-w', lang: 'micropython', firmware: 'a/main.py', interfaces: [{ name: 'mqtt', kind: 'mqtt' }], x: 0, y: 0 },
  { id: 'b', kind: 'mcu', board: 'pico-w', lang: 'micropython', firmware: 'b/main.py', interfaces: [], x: 0, y: 220 },
  { id: 'broker', kind: 'broker', interfaces: [{ name: 'mqtt', kind: 'mqtt' }], x: 360, y: 100 }],
links: [{ id: 'wa', kind: 'mqtt', a: 'a.mqtt', b: 'broker.mqtt' }] }, null, 2);
const A = 'from umqtt.simple import MQTTClient\nc = MQTTClient("a", "broker")\nc.set_callback(lambda t, m: print("got", t, m))\nc.connect()\nc.subscribe(b"room/#")\nwhile True:\n    c.wait_msg()\n';
const B = 'import time\nfrom umqtt.simple import MQTTClient\nc = MQTTClient("b", "broker")\nc.connect()\ntime.sleep_ms(300)\nc.publish(b"room/t", b"21")\n';
const term = (page, id) => page.eval((ed, id) => document.querySelector(`${ed} .sys-term-out[data-term="${id}"]`)?.textContent ?? null, ED, id);

uiTest('#5500 the MQTT broker: its tool, a Pico W\'s + MQTT, linked; Try it: b\'s message through the broker to a, a line typed to the broker; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'NetSys', template: 'uart', files: { 'net.sys.json': SYS, 'a/main.py': A, 'b/main.py': B } });
  const pj = await env.server.api('GET', '/api/projects/NetSys');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/NetSys', { ...pj, kind: 'system', board: null, constraints: null, top: null, system: { simulate: { ms: 1500 } } });
  await page.openProject('NetSys');
  await page.eval(() => window.SilinxApp.openFile('net.sys.json'));
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .sys-add-broker`); return [b.textContent.trim(), b.title]; }, ED),
    ['MQTT Broker', 'Click the canvas to add an MQTT broker: the Pico Ws\' messages, published and subscribed']);
  // b has no MQTT interface: its + MQTT adds it; then linked to the broker (whose interface takes every client)
  await page.click(`${ED} .sys-node[data-id="b"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-side .sys-add-mqtt`), [ED], { what: 'its + MQTT' });
  await page.click(`${ED} .asm-side .sys-add-mqtt`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-iface[data-id="b.mqtt"]`) && !document.querySelector(`${ed} .asm-side .sys-add-mqtt`), [ED], { what: 'b.mqtt' });
  const row = (id) => page.eval((ed, id) => { const r = document.querySelector(`${ed} .sys-iface[data-id="${id}"] .sys-iface-row`).getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; }, ED, id);
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await row('b.mqtt'));
  await page.click(await row('broker.mqtt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '3 nodes · 2 links', [ED], { what: 'the second link' });
  assert.deepEqual(await page.eval(() => window.SilinxApp.findDoc('sys:net.sys.json').systemEditor.getModel().links), [{ id: 'wa', kind: 'mqtt', a: 'a.mqtt', b: 'broker.mqtt' }, { id: 'mqtt', kind: 'mqtt', a: 'b.mqtt', b: 'broker.mqtt' }]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .sys-node[data-id="broker"]`).textContent.includes('MQTT broker'), ED), true);
  // Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-add-broker`)?.textContent.trim() === 'Broker MQTT', [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .sys-add-broker`).title, ED), 'Clique na tela para acrescentar um broker MQTT: as mensagens dos Pico W, publicadas e subscritas');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // Try it: b's publication through the broker to a
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor((ed) => /broker -> a: message room\/t "21"/.test(document.querySelector(`${ed} .sys-term-out[data-term="broker"]`)?.textContent || '') && !window.Silinx.active.systemEditor.sim.state()?.running, [ED], { what: 'the message through the broker', timeout: 240000 });
  assert.equal(await term(page, 'a.repl'), 'got b\'room/t\' b\'21\'\r\n');
  assert.ok((await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-term-cap`)].map((c) => c.textContent), ED)).includes('broker · MQTT broker'));
  // a line typed to the broker's view: published, a gets it
  await page.click(`${ED} .sys-term:has([data-term="broker"]) .sys-term-in`);
  await page.type('room/door open');
  await page.key('Enter');
  await page.waitFor((ed) => /got b'room\/door' b'open'/.test(document.querySelector(`${ed} .sys-term-out[data-term="a.repl"]`)?.textContent || '') && !window.Silinx.active.systemEditor.sim.state()?.running, [ED], { what: 'the typed message at a', timeout: 240000 });
  assert.match(await term(page, 'broker'), /you -> broker: publish room\/door "open"\nbroker -> a: message room\/door "open"\n$/);
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
  assert.deepEqual(lines.filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 600000 });
