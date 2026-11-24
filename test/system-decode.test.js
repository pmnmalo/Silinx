// a System's link decoders (core/system-decode.js, #4699): a UART line's bytes from known frames (8N1, 7E2,
// 8O1), each at its start bit's time; a framing error, a parity error and a wrong baud, with their exact warnings; a
// glitch, a break, a line unknown; the frames' text; a scheduler's links decoded (an AVR and the uart example's FPGA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UartLinkDecoder, decodeUart, parseFrame, uartWarnings, linkTraffic, byteText, usText } from '../core/system-decode.js';
import { SystemSim } from '../core/system-sim.js';
import { AvrNode, loadAvr8js } from '../core/system-sim-avr.js';
import { echoProgram } from './avr-asm.mjs';
import { uartNode } from './system-sim-lib.mjs';

await loadAvr8js();   // (avr8js, before an AvrNode is made: core/system-sim-avr.js, #4701)

// the changes of frames of `bytes` from t0 (ps), an independent encoder: [t, level…], the line idle at 1 first;
// over: a frame's bits changed ({ parity: flipped, stop: 0 })
function frames(bytes, { baud = 9600, frame = '8N1', t0 = 1e6, gap = 0, over = {} } = {}) {
  const { bits, parity, stop } = parseFrame(frame), bit = 1e12 / baud, out = [0, 1];
  let t = t0;
  for (const b of bytes) {
    const data = Array.from({ length: bits }, (_, i) => (b >> i) & 1), ones = data.reduce((a, x) => a + x, 0);
    let p = parity === 'N' ? [] : [(ones + (parity === 'O' ? 1 : 0)) & 1];
    if (over.parity) p = p.map((x) => 1 - x);
    const levels = [0, ...data, ...p, ...Array(stop).fill(over.stop ?? 1)];
    levels.forEach((L, i) => out.push(Math.round(t + i * bit), L));
    t += levels.length * bit + gap;
    out.push(Math.round(t - gap), 1);   // (idle after it)
  }
  return out;
}
const BIT = 1e12 / 9600;

test('known frames: their bytes at their start bits\' times, 8N1, 7E2, 8O1', () => {
  assert.deepEqual(decodeUart(frames([0x48, 0x69, 0x00, 0xff]), { baud: 9600 }),
    [0x48, 0x69, 0x00, 0xff].map((byte, k) => ({ t: Math.round(1e6 + k * 10 * BIT), byte, error: null })));
  const t7 = 1e12 / 115200;
  assert.deepEqual(decodeUart(frames([0x41, 0x7f, 0x03], { baud: 115200, frame: '7E2' }), { baud: 115200, frame: '7e2' }),
    [0x41, 0x7f, 0x03].map((byte, k) => ({ t: Math.round(1e6 + k * 11 * t7), byte, error: null })));
  assert.deepEqual(decodeUart(frames([0x55, 0x80], { frame: '8O1', gap: 3 * BIT }), { baud: 9600, frame: '8O1' }).map((b) => [b.byte, b.error]), [[0x55, null], [0x80, null]]);
  assert.deepEqual(decodeUart(frames([0x15], { frame: '5N1' }), { baud: 9600, frame: '5N1' }).map((b) => b.byte), [0x15]);
  // fed in pieces, flushed: the same
  const d = new UartLinkDecoder({ baud: 9600 }), c = frames([1, 2, 3]);
  for (let i = 0; i < c.length; i += 4) { d.feed(c.slice(i, i + 4)); d.flush(c[i]); }
  d.flush(1e10);
  assert.deepEqual(d.take().map((b) => b.byte), [1, 2, 3]);
  assert.deepEqual(d.take(), [], 'taken');
});

test('a framing error, a parity error, a wrong baud: the bytes flagged, their warnings', () => {
  const fe = decodeUart(frames([0x41], { over: { stop: 0 } }), { baud: 9600 });
  assert.deepEqual(fe, [{ t: 1e6, byte: 0x41, error: 'framing' }]);
  const pe = decodeUart(frames([0x41], { frame: '8E1', over: { parity: true } }), { baud: 9600, frame: '8E1' });
  assert.deepEqual(pe, [{ t: 1e6, byte: 0x41, error: 'parity' }]);
  assert.deepEqual(uartWarnings('uart_avr_tx', [...fe, ...pe, { t: 5e6, byte: 1, error: null }], { baud: 9600, frame: '8E1' }), [
    'uart_avr_tx: a framing error at 1.000 µs (no stop bit at 9600 baud, 8E1): 0x41 received',
    'uart_avr_tx: a parity error at 1.000 µs (8E1): 0x41 received']);
  // a wrong baud: garbage, as on a real board. 'H' (0x48) sent at 9600 and read at 19200: each sample half a bit of
  // the sender's, the first seven of its start bit and its bits 0 to 2 (0), the eighth its bit 3 (1): 0x80, then the
  // rest of the frame read as frames of its own
  assert.deepEqual(decodeUart(frames([0x48, 0x69]), { baud: 19200 }).map((b) => [b.byte, b.error]), [[0x80, null], [0x98, null], [0x86, null], [0x9e, null]]);
  assert.deepEqual(decodeUart(frames([0x48, 0x69, 0x21], { baud: 19200 }), { baud: 9600 }).map((b) => [b.byte, b.error]), [[0x8e, null], [0xfa, null]]);
});

test('a glitch, a break, a line unknown, nothing', () => {
  // a glitch shorter than half a bit: no frame
  assert.deepEqual(decodeUart([0, 1, 1e6, 0, 1e6 + BIT / 4, 1], { baud: 9600, end: 1e9 }), []);
  // a line low from the start (a break): nothing until it rises and falls
  assert.deepEqual(decodeUart([0, 0, 5e8, 1, ...frames([0x31], { t0: 6e8 }).slice(2)], { baud: 9600 }).map((b) => b.byte), [0x31]);
  // a line held low: a byte of zeros with a framing error, then nothing
  assert.deepEqual(decodeUart([0, 1, 1e6, 0], { baud: 9600, end: 1e9 }), [{ t: 1e6, byte: 0, error: 'framing' }]);
  // unknown (null): the line's idle, 1
  assert.deepEqual(decodeUart([0, null, ...frames([0x7e]).slice(2)], { baud: 9600 }).map((b) => b.byte), [0x7e]);
  assert.deepEqual(decodeUart([], { baud: 9600 }), []);
  assert.deepEqual(decodeUart([0, 1], { baud: 9600 }), []);
  // a frame not finished by `end`: not yet a byte
  const cut = 1e6 + 5 * BIT, part = frames([0x41]);
  assert.deepEqual(decodeUart(part.filter((_, i) => part[i - (i % 2)] < cut), { baud: 9600, end: cut }), []);
});

test('the frames\' text, the bytes\' text, the decoders\' errors', () => {
  assert.deepEqual(parseFrame('8N1'), { bits: 8, parity: 'N', stop: 1 });
  assert.deepEqual(parseFrame('7e2'), { bits: 7, parity: 'E', stop: 2 });
  for (const f of ['9N1', '8X1', '8N3', '', null, '8N1 ']) assert.equal(parseFrame(f), null, String(f));
  assert.throws(() => new UartLinkDecoder({ baud: 0 }), /^Error: a UART's baud above 0, not '0'$/);
  assert.throws(() => new UartLinkDecoder({ baud: 9600, frame: '9N1' }), /^Error: '9N1' is not a UART frame \(8N1: data bits 5 to 8, parity N, E or O, stop bits 1 or 2\)$/);
  assert.deepEqual([0x41, 0x0d, 0x7f, 0x20].map(byteText), ['0x41 \'A\'', '0x0D', '0x7F', '0x20 \' \'']);
  assert.equal(usText(1625000), '1.625 µs');
});

test('a scheduler\'s links decoded: an AVR and the uart example\'s FPGA, their bytes and no warnings', async () => {
  const sys = new SystemSim();
  sys.addNode('uno', new AvrNode({ firmware: { program: echoProgram() } }));
  sys.addNode('fpga', await uartNode('compiled', { hz: 50e6, baud: 9600 }));
  sys.link({ name: 'uart_avr_tx', from: 'uno.D1', to: 'fpga.rx', kind: 'uart', baud: 9600, latency: 1e6 });
  sys.link({ name: 'uart_avr_rx', from: 'fpga.tx', to: 'uno.D0', kind: 'uart', baud: 9600, latency: 1e6 });
  sys.run(5e9);
  const t = linkTraffic(sys);
  assert.deepEqual(t.map((l) => [l.link, l.kind, l.bytes.map((b) => String.fromCharCode(b.byte)).join(''), l.warnings]),
    [['uart_avr_tx', 'uart', 'HiIj', []], ['uart_avr_rx', 'uart', 'HiI', []]]);
  assert.equal(t[0].bytes[0].t, 1625000, 'H\'s start bit when the AVR wrote it');
  assert.ok(t[1].bytes.every((b, k) => b.t > t[0].bytes[k].t), 'each echo after its byte');
  // read at another frame: its parity errors said
  const odd = linkTraffic(sys, { frames: { uart_avr_tx: '7O1' } })[0];
  assert.ok(odd.warnings.length > 0);
  assert.match(odd.warnings[0], /^uart_avr_tx: a (parity|framing) error at \d+\.\d{3} µs/);
  // a wire's link: its changes counted, no bytes
  const w = new SystemSim();
  w.addNode('uno', new AvrNode({ firmware: { program: echoProgram() } }));
  w.addNode('fpga', await uartNode('compiled', { hz: 50e6, baud: 9600 }));
  w.link({ name: 'led', from: 'uno.D8', to: 'fpga.rx' });
  w.run(1e8);
  assert.deepEqual(linkTraffic(w), [{ link: 'led', kind: 'wire', changes: 2, bytes: [], warnings: [] }]);
});
