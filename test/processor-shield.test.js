// A processor board's shield (#5898, core/processor-shield.js): a circuit around an Arduino's, a Pico's or an ESP32's
// board in its Board project, a circuit node of its System whose board part is the project's board, labelled with its
// node's id; the Explorer 16/32 none; the refusals. The Pico and Pico W as a circuit's parts (core/circuit-boards.js):
// their 40 pins, their supply pins. A Pico and an ESP32 on a shield, run with the MCP server as Emulate Node runs them: a
// switch read by the program, an LED lit by it (the System's check of a circuit took an Arduino's part only before);
// edit_system's add_shield; the mode changes keep the shield. No warning.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { addShield, shieldOf, shieldRefusal, shieldable, shieldText, withShield, SHIELD_PATH } from '../core/processor-shield.js';
import { processorProject } from '../core/processor-board.js';
import { newProjectJson } from '../core/project-defaults.js';
import { readSystem } from '../core/system-doc.js';
import { checkSystem } from '../core/system-check.js';
import { partDef } from '../core/circuit-parts.js';
import { circuitNodePins } from '../core/system-circuit.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-processor-shield-'); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const lines = t => t.split('\n').filter(l => l && !/^\[End of untrusted/.test(l));
// a new Board project of `board` (its silinx.json and its System document), as New Project makes it
const fresh = board => { const r = processorProject(newProjectJson('t', { kind: 'embedded' }), board); return { pj: r.project, sys: r.writes[0] }; };

test('#5898 a shield for each processor board with a part: its circuit (a half breadboard, its supply, the board labelled with its node), its System\'s circuit node; checked, no problem', () => {
  for (const [board, node, part] of [['arduino-uno', 'uno', 'A1'], ['arduino-nano', 'nano', 'A1'], ['pico', 'pico', 'RP1'], ['pico-w', 'picow', 'RP1'], ['esp32-devkitc', 'esp32', 'E1']]) {
    const { pj, sys } = fresh(board);
    assert.equal(shieldRefusal(pj, readSystem(sys.text).system), null, board);
    const r = addShield(pj, sys);
    assert.deepEqual([r.node, r.circuit, r.writes.map(w => w.path)], [node, SHIELD_PATH, [SHIELD_PATH, sys.path]], board);
    const c = JSON.parse(r.writes[0].text), s = readSystem(r.writes[1].text).system;
    assert.deepEqual(c.parts.map(p => [p.id, p.type, p.label ?? null]), [['BB1', 'breadboard-half', null], ['P1', 'supply', null], [part, board, node]], board);
    assert.ok(c.parts[2].y + partDef(board).size.y0 >= 16, `${board}: below the breadboard's rails`);
    assert.deepEqual([s.nodes.map(n => [n.id, n.kind]), shieldOf(s).circuit, s.links], [[[node, 'mcu'], ['shield', 'circuit']], SHIELD_PATH, []], board);
    assert.deepEqual(checkSystem(s, { circuits: { [SHIELD_PATH]: c } }), [], board);
    assert.deepEqual([withShield(s, node), withShield(s, 'shield')], [[node, 'shield'], ['shield']]);
  }
});

test('#5898 the refusals: the Explorer 16/32 (its own buttons and display), an FPGA project, a second shield; whether a board has one', () => {
  const x = fresh('explorer-1632');
  assert.deepEqual(addShield(x.pj, x.sys), { error: 't: the Explorer 16/32 has its own buttons and display, and no shield' });
  const f = newProjectJson('f', { board: 'basys2' });
  assert.equal(shieldRefusal(f, { nodes: [] }), 'f: a shield is a processor board\'s Board project\'s (an Arduino, a Raspberry Pi Pico or an ESP32 alone)');
  const { pj, sys } = fresh('pico'), once = addShield(pj, sys);
  assert.deepEqual(addShield(pj, once.writes[1]), { error: 't has a shield already: shield/shield.circ.json' });
  assert.deepEqual(['arduino-uno', 'arduino-nano', 'pico', 'pico-w', 'esp32-devkitc', 'explorer-1632', 'basys2'].map(shieldable), [true, true, true, true, true, false, false]);
  assert.equal(shieldText('t', 'pico', SHIELD_PATH), 't: a shield for its Raspberry Pi Pico, shield/shield.circ.json: wire its buttons, switches, displays and LEDs to the board\'s pins; Emulate Node runs the board with it.');
});

test('#5898 the Pico as a circuit\'s part: its 40 pins as the board\'s (1–20 along its bottom, 21–40 back along its top, 0.7 inch above), its supplies, its GPIOs the node\'s', () => {
  for (const id of ['pico', 'pico-w']) {
    const d = partDef(id);
    assert.deepEqual([d.kind, d.board, d.prefix, d.dip, d.pins.length], ['board', id, 'RP', 40, 40]);
    const at = n => { const q = d.pins.find(p => p.n === n); return [q.name, q.dx, q.dy, q.dir]; };
    assert.deepEqual([1, 3, 20, 21, 30, 36, 38, 40].map(at), [['GP0', 0, 0, 'board'], ['GND', 2, 0, 'gnd'], ['GP15', 19, 0, 'board'], ['GP16', 19, -7, 'board'], ['RUN', 10, -7, 'nc'],
      ['3V3', 4, -7, 'vcc'], ['GND', 2, -7, 'gnd'], ['VBUS', 0, -7, 'vcc']]);
    assert.deepEqual(d.pins.filter(p => p.dir === 'board').map(p => p.name), [...[...Array(23).keys()].map(n => `GP${n}`), 'GP26', 'GP27', 'GP28']);
    assert.deepEqual([d.pins.find(p => p.name === 'VBUS').volts, d.pins.find(p => p.name === '3V3').volts, d.pins.find(p => p.name === 'GP5').volts], [5, 3.3, 3.3]);
  }
});

test('#5898 a circuit\'s ESP32 and Pico are their nodes\' boards (an Arduino\'s only before): their pins both ways', () => {
  for (const [board, node, p] of [['esp32-devkitc', 'esp32', 'GPIO4'], ['pico', 'pico', 'GP6']]) {
    const sys = { nodes: [{ id: node, kind: 'mcu', board }, { id: 'c', kind: 'circuit', circuit: 'c.circ.json' }], links: [] };
    const part = partDef(board), q = part.pins.find(x => x.name === p);
    const m = { parts: [{ id: 'X1', type: board, x: 0, y: 0, label: node }, { id: 'S1', type: 'logic-switch', x: q.dx, y: q.dy + 4 }], wires: [{ id: 'w1', points: [[q.dx, q.dy], [q.dx, q.dy + 4]] }] };
    const r = circuitNodePins(sys, sys.nodes[1], m);
    assert.deepEqual([r.problems, r.boards, r.pins.map(x => [x.pin, x.node, x.nodePin, x.to])], [[], [{ part: 'X1', title: part.title, node }], [[p, node, p, 'both']]], board);
  }
});

// a project of `board` with a shield: a switch on `inPin`, an LED on `outPin` to GND, the program `py` (the LED its pin's
// level); simulate run as Emulate Node runs it (controls), the switch on at 100 ms or not
async function wired(name, board, inPin, outPin, py) {
  await ok('new_project', { name, board });
  const s = await ok('edit_system', { project: name, file: `${name}.sys.json`, edits: [{ action: 'add_shield' }] });
  const c = JSON.parse(await P.readFile(name, SHIELD_PATH)), B = c.parts.find(p => p.type === board), d = partDef(board);
  const at = n => { const q = d.pins.find(x => x.name === n); return [B.x + q.dx, B.y + q.dy]; };
  const [ix, iy] = at(inPin), [ox, oy] = at(outPin), [gx, gy] = at('GND');
  c.parts.push({ id: 'S1', type: 'logic-switch', x: ix, y: iy + 4 }, { id: 'D1', type: 'led', x: 40, y: B.y + 6 });
  c.wires.push({ id: 'w10', points: [[ix, iy], [ix, iy + 4]] }, { id: 'w11', points: [[ox, oy], [ox, B.y + 6], [40, B.y + 6]] }, { id: 'w12', points: [[41, B.y + 6], [41, B.y + 9], [gx, B.y + 9], [gx, gy]] });
  await P.writeFile(name, SHIELD_PATH, JSON.stringify(c, null, 2));
  const node = (await ok('project_info', { project: name })).data.nodes.find(n => n.kind === 'mcu');
  await P.writeFile(name, node.files[0], py);
  return s;
}
const run = async (name, on) => {
  const r = await ok('simulate', { project: name, top: `${name}.sys.json`, time_ns: 600e6, controls: on ? [{ node: 'shield', control: 'S1', on: true, at_ns: 100e6 }] : [] });
  assert.deepEqual([r.data.warnings, r.data.errors], [[], []], r.text);
  return [r.data.boards.shield.inputs, r.data.boards.shield.leds];
};

test('#5898 a Pico on its shield (MicroPython on its own firmware): the switch on GP6 read, GP7 lighting the LED; checked, no warning', async () => {
  const s = await wired('pk', 'pico', 'GP6', 'GP7', 'from machine import Pin\nimport time\nb = Pin(6, Pin.IN)\nled = Pin(7, Pin.OUT)\nwhile True:\n    led.value(b.value())\n    time.sleep_ms(1)\n');
  assert.deepEqual(lines(s.text).slice(0, 1), ['pk: a shield for its Raspberry Pi Pico, shield/shield.circ.json: wire its buttons, switches, displays and LEDs to the board\'s pins; Emulate Node runs the board with it.']);
  assert.deepEqual([s.data.edits, s.data.errors, s.data.warnings], [['add_shield shield'], [], []]);
  assert.equal((await ok('project_info', { project: 'pk' })).data.mode, 'board');
  assert.deepEqual(await run('pk', false), [{ S1: false }, { D1: 'off' }]);
  assert.deepEqual(await run('pk', true), [{ S1: true }, { D1: 'on' }]);
});

test('#5898 an ESP32 on its shield: the switch on GPIO4 read, GPIO2 lighting the LED; edit_system\'s add_shield alone, a second refused', async () => {
  await wired('ek', 'esp32-devkitc', 'GPIO4', 'GPIO2', 'from machine import Pin\nimport time\nb = Pin(4, Pin.IN)\nled = Pin(2, Pin.OUT)\nwhile True:\n    led.value(b.value())\n    time.sleep_ms(1)\n');
  assert.deepEqual(await run('ek', false), [{ S1: false }, { D1: 'off' }]);
  assert.deepEqual(await run('ek', true), [{ S1: true }, { D1: 'on' }]);
  const again = await call('edit_system', { project: 'ek', file: 'ek.sys.json', edits: [{ action: 'add_shield' }] });
  assert.deepEqual([again.isError, lines(again.text)[0]], [true, 'edit_system: add_shield: ek has a shield already: shield/shield.circ.json (nothing written)']);
  const two = await call('edit_system', { project: 'ek', file: 'ek.sys.json', edits: [{ action: 'add_shield' }, { action: 'remove_node', node: 'shield' }] });
  assert.deepEqual([two.isError, lines(two.text)[0]], [true, 'edit_system: add_shield: an edit alone (nothing written)']);
  await ok('new_project', { name: 'xk', board: 'explorer-1632' });
  const x = await call('edit_system', { project: 'xk', file: 'xk.sys.json', edits: [{ action: 'add_shield' }] });
  assert.deepEqual([x.isError, lines(x.text)[0]], [true, 'edit_system: add_shield: xk: the Explorer 16/32 has its own buttons and display, and no shield (nothing written)']);
});

test('#5898 the mode changes keep the shield: up to System, its circuit node; down to Board keeping the board, its shield with it', async () => {
  await ok('new_project', { name: 'mk', board: 'arduino-uno' });
  await ok('edit_system', { project: 'mk', file: 'mk.sys.json', edits: [{ action: 'add_shield' }] });
  const nodes = async () => (await ok('project_info', { project: 'mk' })).data.nodes.map(n => [n.id, n.kind]);
  assert.deepEqual(lines((await ok('set_design_properties', { project: 'mk', mode: 'system' })).text), ['mk: System now (nothing lost).', '  its board the System\'s first node, uno (arduino-uno), its files in its folder already']);
  assert.deepEqual([(await ok('project_info', { project: 'mk' })).data.mode, await nodes()], ['system', [['uno', 'mcu'], ['shield', 'circuit']]]);
  const down = await ok('set_design_properties', { project: 'mk', mode: 'board', keep: 'uno', confirm: true });
  assert.deepEqual(lines(down.text), ['mk: Board now (nothing deleted: what left the project stays on the disk).', '  the node uno the project\'s (arduino-uno)', 'WARNING: lost: its System document mk.sys.json rewritten with the node alone and its shield']);
  assert.deepEqual([(await ok('project_info', { project: 'mk' })).data.mode, await nodes()], ['board', [['uno', 'mcu'], ['shield', 'circuit']]]);
});
