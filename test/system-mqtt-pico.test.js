// Two MicroPython nodes exchange messages through the MQTT broker (#5500, core/micropython-net.js, core/system-mqtt.js):
// two Pico Ws on rp2040js (#5494), each with Silinx's `network` and `umqtt.simple`, linked to a broker node. `a`
// connects its WLAN, subscribes to room/+ and waits; `b` publishes room/t 21; a's callback prints it and lights its LED.
// The broker's traffic, its view's text, the REPLs' consoles, no warning; with no broker linked, `connect` says so in a's
// traceback. The firmware's files from the tests' shared folder (SILINX_RP2040_CACHE: downloaded once).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { prepareSystem, systemReport } from '../core/system-run.js';
import { loadRp2040 } from '../core/system-sim-rp2040.js';
import { frameText, NETWORK_SETUP } from '../core/micropython-net.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
before(async () => { await import('../server/rp2040-firmware.js'); await loadRp2040(); });

const A = ['import network', 'from machine import Pin', 'from umqtt.simple import MQTTClient', 'w = network.WLAN(network.STA_IF)', 'w.active(True)', 'w.connect("lab", "secret")',
  'print("wifi", w.isconnected())', 'def cb(topic, msg):', '    print("got", topic, msg)', '    Pin(25, Pin.OUT).value(1)', 'c = MQTTClient("a", "broker")', 'c.set_callback(cb)', 'c.connect()',
  'c.subscribe(b"room/+")', 'while True:', '    c.wait_msg()', ''].join('\n');
const B = ['import time', 'from umqtt.simple import MQTTClient', 'c = MQTTClient("b", "broker")', 'c.connect()', 'time.sleep_ms(300)', 'c.publish(b"room/t", b"21")', 'print("sent")', ''].join('\n');
const SYS = (links = true) => ({ format: 'silinx-system', version: 2, name: 'net', nodes: [
  { id: 'a', kind: 'mcu', board: 'pico-w', lang: 'micropython', firmware: 'a/main.py', interfaces: [{ name: 'mqtt', kind: 'mqtt' }] },
  { id: 'b', kind: 'mcu', board: 'pico-w', lang: 'micropython', firmware: 'b/main.py', interfaces: [{ name: 'mqtt', kind: 'mqtt' }] },
  { id: 'broker', kind: 'broker', interfaces: [{ name: 'mqtt', kind: 'mqtt' }] }],
links: links ? [{ id: 'wa', kind: 'mqtt', a: 'a.mqtt', b: 'broker.mqtt' }, { id: 'wb', kind: 'mqtt', a: 'b.mqtt', b: 'broker.mqtt' }] : [] });

test('#5500 the frames and the modules\' setup: RS, JSON, LF; Python that puts network and umqtt.simple into sys.modules', () => {
  assert.equal(frameText({ type: 'connack' }), '\x1e{"type":"connack"}\n');
  assert.match(NETWORK_SETUP, /^import sys\n/);
  assert.ok(NETWORK_SETUP.includes('_silinx_module("network", ') && NETWORK_SETUP.includes('_silinx_module("umqtt.simple", '));
  assert.ok(!/[\x00-\x09\x0b-\x1f]/.test(NETWORK_SETUP), 'no control character typed into the raw REPL');
});

test('#5500 two Pico Ws through the broker: b publishes, a\'s callback gets it; the broker\'s traffic; no warning', async () => {
  const r = await prepareSystem(SYS(), { firmware: async p => (p.startsWith('a/') ? A : B) });
  assert.ok(!r.error, r.error);
  r.sim.run(1500e9);
  const rep = systemReport(r);
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
  assert.deepEqual(rep.terminals['a.repl'], 'wifi True\r\ngot b\'room/t\' b\'21\'\r\n');
  assert.deepEqual(rep.terminals['b.repl'], 'sent\r\n>>> ');
  assert.equal(r.sim.nodes.get('a').value('GP25'), 1);
  const said = rep.mqtt.broker.map(e => `${e.client} ${e.dir} ${e.type}${e.topic ? ` ${e.topic}` : ''}${e.payload != null ? ` ${e.payload}` : ''}`);
  // (the clients' connects in the order their programs reach them: b first, its program shorter)
  assert.deepEqual(said.filter(x => / (publish|message|subscribe|suback)/.test(x)), ['a in subscribe room/+', 'a out suback room/+', 'b in publish room/t 21', 'a out message room/t 21']);
  assert.deepEqual(said.filter(x => /connect|connack/.test(x)).sort(), ['a in connect', 'a out connack', 'b in connect', 'b out connack']);
  const pub = rep.mqtt.broker.find(e => e.type === 'publish'), msg = rep.mqtt.broker.find(e => e.type === 'message');
  assert.equal(msg.t, pub.t, 'forwarded at once by the broker');
  assert.ok(pub.t > 300e9 && pub.t < 600e9, `published after b's 300 ms: ${pub.t}`);
  assert.match(rep.terminals.broker, /^b -> broker: connect\n|^a -> broker: connect\n/);
  assert.ok(rep.terminals.broker.endsWith('b -> broker: publish room/t "21"\nbroker -> a: message room/t "21"\n'), rep.terminals.broker);
  assert.ok(rep.lines.some(l => /^broker broker: 8 message\(s\): /.test(l)), rep.lines.join('\n'));
  assert.deepEqual(rep.traffic, [], 'no wire\'s bytes: the network link\'s messages are the broker\'s');
});

test('#5500 a client with no broker: connect says no broker answered, in its traceback', async () => {
  const r = await prepareSystem(SYS(false), { firmware: async p => (p.startsWith('a/') ? A : B) });
  assert.ok(!r.error, r.error);
  r.sim.run(2500e9);
  const rep = systemReport(r);
  assert.deepEqual(rep.errors.map(e => e.replace(/ \| .*\| /, ' … ')).sort(), ['a: its program: Traceback (most recent call last): … MQTTException: no broker answered', 'b: its program: Traceback (most recent call last): … MQTTException: no broker answered']);
});
