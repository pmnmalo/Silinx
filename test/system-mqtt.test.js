// A System's network links and its MQTT broker node (#5500, core/system-mqtt.js): topic filters against MQTT 3.1.1's own
// examples (4.7); the broker's semantics (connect, subscribe with wildcards, publish to every matching subscriber, the
// publisher too, retained messages and their deletion, unsubscribe, disconnect, a message before connect, a wildcard
// in a published topic, a filter that is none), its traffic as its view says it, a line typed to it published; the
// subscriptions nobody published to so far, said in the report; on the scheduler, a message's delivery after the link's latency
// (1 ms), and the same run twice the same (determinism); the System's check and edits of MQTT links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrokerNode, topicMatches, filterError, messageText } from '../core/system-mqtt.js';
import { SystemSim } from '../core/system-sim.js';
import { lookahead } from '../core/system-links.js';
import { checkSystem } from '../core/system-check.js';
import { addNode, addLink, addInterface } from '../core/system-edit.js';
import { newSystem, normalizeSystem } from '../core/system-doc.js';
import { systemPlan } from '../core/system-build.js';

test('#5500 topic filters: MQTT 3.1.1\'s examples (its section 4.7: the wildcards, the topics starting with $); a filter that is none', () => {
  const t = 'sport/tennis/player1';
  assert.deepEqual(['sport/tennis/player1/#', 'sport/#', '#', 'sport/tennis/#', 'sport/tennis/+', '+/tennis/player1', 'sport/+/player1', '+/+/+'].map(f => topicMatches(f, t)), [true, true, true, true, true, true, true, true]);
  assert.equal(topicMatches('sport/tennis/player1/#', 'sport/tennis/player1/ranking'), true);
  assert.equal(topicMatches('sport/#', 'sport'), true, '# also the parent level');
  assert.equal(topicMatches('sport/+', 'sport'), false);
  assert.equal(topicMatches('sport/+', 'sport/'), true);
  assert.equal(topicMatches('+/+', '/finance'), true);
  assert.equal(topicMatches('/+', '/finance'), true);
  assert.equal(topicMatches('+', '/finance'), false);
  assert.equal(topicMatches('#', '$SYS/broker'), false, 'a $ topic not by a wildcard');
  assert.equal(topicMatches('$SYS/#', '$SYS/broker'), true);
  assert.equal(topicMatches('room/t', 'room/T'), false, 'case sensitive');
  assert.deepEqual(['sport/tennis#', 'sport/tennis/#/ranking', 'sport+', '', 'a/+/b', '#'].map(filterError),
    ["'sport/tennis#': # is a level of its own, the last", "'sport/tennis/#/ranking': # is a level of its own, the last", "'sport+': + is a level of its own", 'an empty topic filter', null, null]);
});

// a broker run by hand: its messages taken at their times
function broker(clients = ['a', 'b']) {
  const b = new BrokerNode({ clients });
  const say = (client, m, t = b.now) => { b.advanceTo(t); b.setPin(`rx_${client}`, m); return b.advanceTo(t).map(o => [o.pin, o.value]); };
  return { b, say };
}

test('#5500 the broker: connect, subscribe (wildcards), publish to every subscriber, retained, unsubscribe, its traffic\'s text', () => {
  const { b, say } = broker(['a', 'b', 'c']);
  assert.deepEqual(b.inputs, ['rx_a', 'rx_b', 'rx_c']);
  assert.deepEqual(say('a', { type: 'connect', client: 'a' }), [['tx_a', { type: 'connack' }]]);
  say('b', { type: 'connect', client: 'b' });
  say('c', { type: 'connect', client: 'c' });
  assert.deepEqual(say('a', { type: 'subscribe', topic: 'room/+' }), [['tx_a', { type: 'suback', topic: 'room/+' }]]);
  say('b', { type: 'subscribe', topic: 'room/t' });
  // (a publication: to a and b, not c; the publisher too when subscribed)
  assert.deepEqual(say('b', { type: 'publish', topic: 'room/t', payload: '21', retain: false }, 1e9), [['tx_a', { type: 'message', topic: 'room/t', payload: '21', retain: false }], ['tx_b', { type: 'message', topic: 'room/t', payload: '21', retain: false }]]);
  assert.deepEqual(say('c', { type: 'publish', topic: 'hall/t', payload: '19', retain: false }), []);
  // (retained: kept, sent to a later subscriber as retained; an empty one deletes it)
  say('c', { type: 'publish', topic: 'room/h', payload: '40', retain: true });
  assert.deepEqual(say('c', { type: 'subscribe', topic: 'room/#' }), [['tx_c', { type: 'suback', topic: 'room/#' }], ['tx_c', { type: 'message', topic: 'room/h', payload: '40', retain: true }]]);
  say('a', { type: 'publish', topic: 'room/h', payload: '', retain: true });
  assert.deepEqual(say('b', { type: 'subscribe', topic: 'room/h' }), [['tx_b', { type: 'suback', topic: 'room/h' }]]);
  // (unsubscribe, disconnect: nothing more to them)
  say('a', { type: 'unsubscribe', topic: 'room/+' });
  say('b', { type: 'disconnect' });
  assert.deepEqual(say('c', { type: 'publish', topic: 'room/t', payload: '22', retain: false }), [['tx_c', { type: 'message', topic: 'room/t', payload: '22', retain: false }]]);
  assert.deepEqual(b.messages(), []);
  assert.deepEqual(b.traffic.slice(0, 2).map(messageText), ['a -> broker: connect', 'broker -> a: connack']);
  assert.equal(messageText(b.traffic.find(e => e.message.retain)), 'c -> broker: publish room/h "40" (retained)');
  assert.equal(b.traffic.find(e => e.message.type === 'publish').t, 1e9);
});

test('#5500 the broker\'s warnings: before connect, a wildcard published to, a filter that is none, an unknown message; subscribed with no publisher; a line typed to it', () => {
  const { b, say } = broker(['a', 'b']);
  assert.deepEqual(say('a', { type: 'publish', topic: 'x', payload: '1' }), []);
  say('a', { type: 'connect', client: 'a' });
  say('a', { type: 'publish', topic: 'room/+', payload: '1' });
  say('a', { type: 'subscribe', topic: 'room#' });
  say('a', { type: 'ping' });
  say('a', { type: 'subscribe', topic: 'door/open' });
  assert.deepEqual(b.messages().map(m => m.text), ['MQTT: a sent publish before connect: dropped', "MQTT: a published to 'room/+': a topic has no wildcard",
    "MQTT: a's subscribe: 'room#': # is a level of its own, the last", "MQTT: a sent 'ping', not an MQTT message Silinx models"]);
  assert.deepEqual(b.unheard(), ['MQTT: door/open: subscribed by a, nobody published to it']);
  // (a line typed to its view: published by `you`, to the subscribers)
  b.send([...Buffer.from('door/open yes it is\n')]);
  assert.deepEqual(b.advanceTo(b.now).map(o => [o.pin, o.value]), [['tx_a', { type: 'message', topic: 'door/open', payload: 'yes it is', retain: false }]]);
  assert.deepEqual(b.unheard(), []);
  assert.match(new TextDecoder().decode(Uint8Array.from(b.received.map(x => x.byte))), /you -> broker: publish door\/open "yes it is"\nbroker -> a: message door\/open "yes it is"\n$/);
});

// two clients that are stimuli of the scheduler: a publishes at 2 ms, b subscribed at 1 ms; the broker between them
function twoClients() {
  const sim = new SystemSim();
  const client = (name, sends) => {
    const n = { inputs: ['net_rx'], outputs: ['net_tx'], now: 0, got: [], v: null, todo: [...sends],
      value: p => (p === 'net_tx' ? n.v : null), setPin(p, v) { if (v) n.got.push({ t: n.now, v }); }, nextEventTime: () => n.todo[0]?.t ?? Infinity, at() {}, messages: () => [],
      advanceTo(t) { const out = []; while (n.todo.length && n.todo[0].t <= t) { const m = n.todo.shift(); n.v = m.m; out.push({ pin: 'net_tx', t: m.t, value: m.m }); } n.now = t; return out; } };
    return n;
  };
  const a = client('a', [{ t: 0.5e9, m: { type: 'connect', client: 'a' } }, { t: 2e9, m: { type: 'publish', topic: 'room/t', payload: '21' } }]);
  const b = client('b', [{ t: 0.2e9, m: { type: 'connect', client: 'b' } }, { t: 1e9, m: { type: 'subscribe', topic: 'room/t' } }]);
  sim.addNode('a', a); sim.addNode('b', b); const k = sim.addNode('broker', new BrokerNode({ clients: ['a', 'b'] }));
  const latency = lookahead({ protocol: 'mqtt' });
  for (const c of ['a', 'b']) {
    sim.link({ name: `${c}_up`, from: `${c}.net_tx`, to: `broker.rx_${c}`, latency });
    sim.link({ name: `${c}_down`, from: `broker.tx_${c}`, to: `${c}.net_rx`, latency });
  }
  sim.run(6e9);
  return { a, b, k };
}

test('#5500 on the scheduler: each message after the link\'s latency (1 ms each way); the same run twice the same', () => {
  assert.equal(lookahead({ protocol: 'mqtt' }), 1e9);
  const r = twoClients();
  // (b's connect reaches the broker at 1.2 ms, its connack b at 2.2 ms; its subscribe at 2 ms, the suback 3 ms; a's publish
  // at 3 ms, b gets it at 4 ms)
  assert.deepEqual(r.b.got.map(g => [g.t, g.v.type]), [[2.2e9, 'connack'], [3e9, 'suback'], [4e9, 'message']]);
  assert.deepEqual(r.k.traffic.map(e => [e.t, e.client, e.dir, e.message.type]), [[1.2e9, 'b', 'in', 'connect'], [1.2e9, 'b', 'out', 'connack'], [1.5e9, 'a', 'in', 'connect'], [1.5e9, 'a', 'out', 'connack'],
    [2e9, 'b', 'in', 'subscribe'], [2e9, 'b', 'out', 'suback'], [3e9, 'a', 'in', 'publish'], [3e9, 'b', 'out', 'message']]);
  assert.deepEqual(JSON.stringify(twoClients().k.traffic), JSON.stringify(r.k.traffic));
});

test('#5500 the System: a Pico W\'s MQTT interface, a broker, their link checked; a Pico\'s refused; the plan\'s wires', () => {
  let s = newSystem('net');
  s = addNode(s, { kind: 'mcu', board: 'pico-w', id: 'a' }).system;
  assert.deepEqual(s.nodes[0].interfaces.map(i => [i.name, i.kind]), [['UART0', 'uart'], ['UART1', 'uart'], ['mqtt', 'mqtt']]);
  s = addNode(s, { kind: 'mcu', board: 'pico', id: 'p' }).system;
  assert.deepEqual(addInterface(s, 'p', { kind: 'mqtt' }), { error: 'p: an MQTT interface is a network\'s: a Pico W\'s' });
  s = addNode(s, { kind: 'broker' }).system;
  assert.deepEqual(s.nodes[2], { id: 'broker', kind: 'broker', interfaces: [{ name: 'mqtt', kind: 'mqtt' }], x: 0, y: 0 });
  assert.deepEqual(addInterface(s, 'broker', { kind: 'mqtt' }), { error: 'broker: an MQTT broker has one interface, its own' });
  s = addNode(s, { kind: 'mcu', board: 'pico-w', id: 'b' }).system;
  s = addLink(s, { a: 'a.mqtt', b: 'broker.mqtt' }).system;
  const two = addLink(s, { a: 'b.mqtt', b: 'broker.mqtt' });
  assert.deepEqual([two.error, two.id], [undefined, 'mqtt2'], 'a broker\'s interface every client\'s');
  s = two.system;
  assert.deepEqual(addLink(s, { a: 'a.UART0', b: 'broker.mqtt' }).error, 'a.UART0 is a UART, broker.mqtt is an MQTT interface: a link joins two interfaces of one kind');
  const said = m => checkSystem(normalizeSystem(m), { files: [] }).filter(d => d.severity === 'error').map(d => d.message);
  assert.deepEqual(said(s), []);
  // (two clients linked to each other, a Pico's MQTT interface written by hand)
  assert.deepEqual(said({ ...s, links: [{ id: 'x', kind: 'mqtt', a: 'a.mqtt', b: 'b.mqtt' }] }), ['x: an MQTT link joins a client and a broker']);
  const bad = { ...s, nodes: s.nodes.map(n => (n.id === 'p' ? { ...n, interfaces: [{ name: 'mqtt', kind: 'mqtt' }] } : n)) };
  assert.deepEqual(said(bad), ['p.mqtt: the Raspberry Pi Pico has no network (an MQTT client is a Pico W\'s)']);
  const plan = systemPlan({ ...s, nodes: s.nodes.map(n => ({ ...n, firmware: n.kind === 'mcu' ? `${n.id}/main.py` : undefined })) });
  assert.deepEqual(plan.wires.map(w => [w.name, w.kind, w.from, w.to]), [['mqtt_up', 'mqtt', 'a.net_tx', 'broker.rx_a'], ['mqtt_down', 'mqtt', 'broker.tx_a', 'a.net_rx'],
    ['mqtt2_up', 'mqtt', 'b.net_tx', 'broker.rx_b'], ['mqtt2_down', 'mqtt', 'broker.tx_b', 'b.net_rx']]);
});
