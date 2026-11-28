// The PIC24 emulator's loading and its node (#5480, packages/silinx-pic24/src/hex.js, config.js, node.js): XC16's
// Intel HEX (four bytes a program word, its phantom byte, the HEX's byte address the program address * 2, the
// extended linear addresses, the checksums), the configuration words read (the oscillator and so Fcy, the
// watchdog), and the node's run(t1, inputEvents): its time in ps at Fcy, its inputs at their times, its outputs'
// changes with theirs, its log, its state saved and restored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, writeHex, readConfig, Pic24Node, CPU } from '../packages/silinx-pic24/src/index.js';
import { pic24Assemble } from './pic24-asm.mjs';

test('#5480 a HEX record by hand: GOTO 0x200 at 0 is the bytes 00 02 04 00 00 00 00 00, its checksum 0xF2', () => {
  const hex = ':080000000002040000000000F2\n:00000001FF\n';
  const { program, words, warnings } = parseHex(hex);
  assert.deepEqual([program[0], program[1], program[2], words, warnings], [0x040200, 0x000000, 0xffffff, 2, []]);
  assert.equal(writeHex([0x040200, 0x000000]), ':020000040000FA\n' + hex);
});

test('#5480 HEX: the extended linear addresses (a program word at 0x8000 is the HEX\'s 0x10000), a round trip, the config space', () => {
  const words = Array.from({ length: 40 }, (_, i) => (i * 0x010203) & 0xffffff);
  const { program } = parseHex(writeHex(words, 0x7ff0));   // across the HEX's 64K page at 0x8000
  assert.deepEqual([...program.subarray(0x7ff0 >> 1, (0x7ff0 >> 1) + 40)], words);
  assert.match(writeHex(words, 0x7ff0), /^:020000040000FA\n[\s\S]*\n:020000040001F9\n/);
  // the phantom byte ignored; a word at 0x801800 (FBOOT) in the configuration space
  const { program: p2, config } = parseHex(':0400000056341299C7\n:020000040100F9\n:04000000FCFFFF0002\n:00000001FF\n');
  assert.equal(p2[0], 0x123456);
  assert.equal(config.get(0x800000), 0xfffffc);
  // a word past the flash, not in the configuration space: ignored, said
  assert.deepEqual(parseHex(':020000040040BA\n:04000000AA00000052\n:00000001FF\n').warnings, ['1 program word(s) beyond the flash\'s end (0xABFFE) ignored']);
});

test('#6027 FICD\'s JTAGEN (bit 5): the JTAG port on when erased, off at 0', () => {
  const at = (words) => (a) => words[a] ?? 0xffffff;
  assert.equal(readConfig(at({})).jtag, true);
  assert.equal(readConfig(at({ 0x0abf28: 0xffffdf })).jtag, false);
  assert.equal(readConfig(at({ 0x0abf28: 0xffffff & ~0x20 & ~0x03 })).jtag, false, 'ICS\'s bits another field');
  assert.equal(readConfig(at({ 0x0abf28: 0xfffffc })).jtag, true);
});

test('#5480 HEX: its errors (a checksum, no end of file, a malformed record, a record after the end)', () => {
  assert.throws(() => parseHex(':080000000002040000000000F3\n:00000001FF\n'), /line 1: a wrong checksum/);
  assert.throws(() => parseHex(':080000000002040000000000F2\n'), /no end-of-file record/);
  assert.throws(() => parseHex('080000000002040000000000F2\n'), /line 1: not an Intel HEX record/);
  assert.throws(() => parseHex(':00000001FF\n:00000001FF\n'), /line 2: a record after the end of file/);
  assert.throws(() => parseHex(':0800000000020400000000F2\n:00000001FF\n'), /line 1: its length is 8, its data 7 bytes/);
});

test('#5480 the configuration words: the oscillator (FNOSC, PLLMODE) and Fcy = Fosc / 2; the watchdog (FWDTEN)', () => {
  const at = (words) => (a) => words[a] ?? 0xffffff;
  // erased: the FRC divided (OSCFDIV, /2 at reset): 4 MHz, Fcy 2 MHz; the watchdog on (wdt.js emulates it, #5481)
  let c = readConfig(at({}));
  assert.deepEqual([c.oscillator, c.watchdog, c.warnings], [{ source: 'FRCDIV', fosc: 4e6, fcy: 2e6 }, 'on', []]);
  // FRCPLL with the 96 MHz USB PLL (input 8 MHz): 32 MHz, Fcy 16 MHz; the watchdog off (FWDTEN 00)
  c = readConfig(at({ 0x0abf18: 0xfffc09, 0x0abf20: 0xffff9f }));
  assert.deepEqual([c.oscillator, c.watchdog, c.warnings], [{ source: 'FRCPLL', fosc: 32e6, fcy: 16e6 }, 'off', []]);
  // the primary oscillator, the Explorer 16/32's 8 MHz crystal, with the 4x PLL; software-controlled watchdog
  c = readConfig(at({ 0x0abf18: 0xfffc63, 0x0abf20: 0xffffdf }));
  assert.deepEqual([c.oscillator, c.watchdog], [{ source: 'PRIPLL', fosc: 32e6, fcy: 16e6 }, 'software']);
  c = readConfig(at({ 0x0abf18: 0xfffc02 }), { primaryHz: 12e6 });
  assert.deepEqual(c.oscillator, { source: 'PRI', fosc: 12e6, fcy: 6e6 });
  c = readConfig(at({ 0x0abf18: 0xfffc71 }));
  assert.deepEqual(c.warnings[0], 'the oscillator\'s 64 MHz is above the device\'s 32 MHz');
});

// a program: the reset's GOTO to 0x200, the code there; the configuration words FRCPLL, the watchdog off
function hexOf(lines) {
  const { words } = pic24Assemble(['goto 0x200', '.org 0x200', ...lines]);
  const cfg = new Array(0x56000).fill(0xffffff);
  cfg[0x0abf18 >> 1] = 0xfffc09; cfg[0x0abf20 >> 1] = 0xffff9f;
  return writeHex(words) .replace(':00000001FF\n', '') + writeHex(cfg.slice(0x0abf00 >> 1, (0x0abf30 >> 1)), 0x0abf00);
}

test('#5480 Pic24Node: XC16\'s HEX loaded, Fcy from its configuration (16 MHz: 62500 ps a cycle), run(t1) to its time', () => {
  const node = new Pic24Node({ hex: hexOf(['loop: inc w0, w0', 'bra loop']) });
  assert.equal(node.fcy, 16e6);
  assert.deepEqual(node.messages(), []);
  const { outputs, t } = node.run(1e6);   // 1 µs: 16 cycles, the last instruction ending past them
  assert.deepEqual(outputs, []);
  // GOTO (2), then (INC 1, BRA 2) five times: 17 cycles
  assert.deepEqual([node.cpu.cycles, t, node.cpu.W(0)], [17, 17 * 62500, 5]);
  // an erased configuration: Fcy 2 MHz, the watchdog on (its 135 s ahead), nothing said
  const e = new Pic24Node({ hex: writeHex(pic24Assemble(['bra 0']).words) });
  assert.deepEqual([e.fcy, e.messages()], [2e6, []]);
});

test('#5480 Pic24Node: the input events applied at their times, the outputs driven with theirs; the state saved and restored', () => {
  const node = new Pic24Node({ program: pic24Assemble(['loop: inc w0, w0', 'bra loop']).words, fcy: 1e6 });   // 1 µs a cycle
  const seen = [];
  node.onInput('RD6', (v) => { seen.push([v, node.time]); node.drive('RA0', v ? 0 : 1); });
  const r = node.run(10e6, [{ t: 5e6, pin: 'RD6', value: 0 }, { t: 2e6, pin: 'RD6', value: 1 }]);
  assert.deepEqual(seen, [[1, 3e6], [0, 6e6]], 'each at its time (the instruction under way ends first)');
  assert.deepEqual(r.outputs, [{ pin: 'RA0', t: 3e6, value: 0 }, { pin: 'RA0', t: 6e6, value: 1 }]);
  assert.equal(r.t, 10e6);
  const saved = node.save(), w0 = node.cpu.W(0);
  node.run(20e6);
  node.restore(saved);
  assert.deepEqual([node.time, node.cpu.W(0)], [10e6, w0]);
  assert.deepEqual(node.run(20e6).t, 21e6, 'the same run again (its last instruction past t1)');
  assert.equal(new Pic24Node({ program: [0x200050], fcy: 1e6 }).cpu instanceof CPU, true);
});
