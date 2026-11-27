// The MCP server with a System's MQTT broker (#5500, #2674: as the System editor and Simulate System): edit_system adds
// two Pico Ws (their MQTT interfaces) and a broker, links them, gives each its program; check_system describes and
// checks them (a Pico's MQTT refused); simulate runs them: the broker's traffic in its data, its view's text a
// terminal's, the subscriber's console. The firmware's files from the tests' shared folder (SILINX_RP2040_CACHE).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-system-mqtt-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const SYS = 'uart_avr.sys.json';
const SUB = 'from umqtt.simple import MQTTClient\nc = MQTTClient("sub", "broker")\nc.set_callback(lambda t, m: print(t, m))\nc.connect()\nc.subscribe(b"lab/#")\nwhile True:\n    c.wait_msg()\n';
const PUB = 'import time\nfrom umqtt.simple import MQTTClient\nc = MQTTClient("pub", "broker")\nc.connect()\ntime.sleep_ms(200)\nc.publish(b"lab/door", b"open", retain=True)\n';

test('#5500 edit_system adds a broker and two Pico Ws; check_system describes them; simulate: the broker\'s traffic, the subscriber\'s console', async () => {
  await ok('new_project_from_example', { name: 'm', example: 'uart-avr' });
  await ok('write_file', { project: 'm', path: SYS, text: JSON.stringify({ format: 'silinx-system', version: 2, name: 'lab', nodes: [], links: [] }, null, 2) });
  await ok('write_file', { project: 'm', path: 'sub/main.py', text: SUB });
  await ok('write_file', { project: 'm', path: 'pub/main.py', text: PUB });
  const e = await ok('edit_system', { project: 'm', file: SYS, edits: [
    { action: 'add_node', fields: { kind: 'mcu', id: 'sub', board: 'pico-w' } },
    { action: 'change_node', node: 'sub', fields: { firmware: 'sub/main.py' } },
    { action: 'add_node', fields: { kind: 'mcu', id: 'pub', board: 'pico-w', x: 200 } },
    { action: 'change_node', node: 'pub', fields: { firmware: 'pub/main.py' } },
    { action: 'add_node', fields: { kind: 'broker', id: 'broker', x: 400 } },
    { action: 'add_link', fields: { a: 'sub.mqtt', b: 'broker.mqtt' } },
    { action: 'add_link', fields: { a: 'pub.mqtt', b: 'broker.mqtt' } },
  ] });
  assert.equal(e.text.split('\n').at(-1), `Process "Check System" of ${SYS} completed successfully.`);
  const c = await ok('check_system', { project: 'm', file: SYS });
  assert.deepEqual(c.text.split('\n').filter(l => /^(node|link|  mqtt)/.test(l)), ['node sub: Raspberry Pi Pico W, program sub/main.py, in MicroPython', '  mqtt: MQTT', 'node pub: Raspberry Pi Pico W, program pub/main.py, in MicroPython', '  mqtt: MQTT',
    'node broker: MQTT broker', '  mqtt: MQTT', 'link mqtt: MQTT sub.mqtt ↔ broker.mqtt', 'link mqtt2: MQTT pub.mqtt ↔ broker.mqtt']);
  assert.deepEqual([c.data.errors, c.data.warnings], [[], []]);
  const s = await ok('simulate', { project: 'm', top: SYS, time_ns: 1200e6 });
  assert.deepEqual([s.data.warnings, s.data.errors], [[], []]);
  assert.deepEqual(s.data.terminals['sub.repl'], 'b\'lab/door\' b\'open\'\r\n');
  assert.deepEqual(s.data.mqtt.broker.filter(m => m.topic === 'lab/door' || m.topic === 'lab/#').map(m => [m.client, m.dir, m.type, m.topic, m.payload ?? null, m.retain ?? null]),
    [['sub', 'in', 'subscribe', 'lab/#', null, null], ['sub', 'out', 'suback', 'lab/#', null, null], ['pub', 'in', 'publish', 'lab/door', 'open', true], ['sub', 'out', 'message', 'lab/door', 'open', false]]);
  assert.ok(s.text.split('\n').some(l => /^broker broker: 8 message\(s\)/.test(l)), s.text);
});

test('#5500 a Pico\'s MQTT interface refused by edit_system; a link of two clients by check_system', async () => {
  const r = await call('edit_system', { project: 'm', file: SYS, edits: [{ action: 'add_node', fields: { kind: 'mcu', id: 'plain', board: 'pico' } }, { action: 'add_interface', node: 'plain', fields: { kind: 'mqtt' } }] });
  assert.equal(r.isError, true);
  assert.match(r.text, /plain: an MQTT interface is a network's: a Pico W's/);
});

test('#5910 edit_system keeps to the project\'s profile: an Embedded / SoC project\'s System refuses a terminal and a broker (nothing written); a System project\'s takes both; an FPGA project\'s System document, no rule', async () => {
  await ok('new_project', { name: 'emb', profile: 'embedded' });
  const P = await import('../server/projects.js');
  const file = 'emb.sys.json', at = path.join(P.projectDir('emb'), file), before = fs.readFileSync(at, 'utf8');
  for (const kind of ['terminal', 'broker']) {
    const r = await call('edit_system', { project: 'emb', file, edits: [{ action: 'add_node', fields: { kind: 'mcu', id: 'uno' } }, { action: 'add_node', fields: { kind, id: 'x' } }] });
    assert.deepEqual([r.isError, r.text], [true, `edit_system: edit 1 (add_node): an Embedded / SoC project's System has no ${kind} node (Embedded / SoC allows design, circuit, fpga, mcu: Design Properties' Project Kind changes it) (nothing written)`]);
  }
  assert.equal(fs.readFileSync(at, 'utf8'), before, 'nothing written');
  const m = await ok('edit_system', { project: 'emb', file, edits: [{ action: 'add_node', fields: { kind: 'mcu', id: 'uno' } }] });
  assert.deepEqual([m.data.edits, m.data.warnings], [['add_node uno'], []]);
  // (a System project: a terminal and a broker; the uart example, an FPGA project: its System document has no rule)
  await ok('new_project', { name: 'sys', profile: 'system' });
  const s = await ok('edit_system', { project: 'sys', file: 'sys.sys.json', edits: [{ action: 'add_node', fields: { kind: 'terminal', id: 't' } }, { action: 'add_node', fields: { kind: 'broker', id: 'b' } }] });
  assert.deepEqual(s.data.edits, ['add_node t', 'add_node b']);
  await ok('new_project_from_example', { name: 'fp', example: 'uart' });
  await ok('write_file', { project: 'fp', path: 'x.sys.json', text: JSON.stringify({ format: 'silinx-system', version: 2, name: 'x', nodes: [], links: [] }, null, 2) });
  assert.deepEqual((await ok('edit_system', { project: 'fp', file: 'x.sys.json', edits: [{ action: 'add_node', fields: { kind: 'terminal', id: 't' } }] })).data.edits, ['add_node t']);
});
