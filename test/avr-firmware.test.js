// A microcontroller node's firmware (core/avr-firmware.js, #4698): an Intel HEX's and an ELF's program read into the
// flash, the same words as the program assembled (test/avr-asm.mjs); the errors of a file that is not a program, a
// broken record, a program too big for the flash, an ELF of another machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFirmware, readIntelHex, readAvrElf, FLASH_BYTES } from '../core/avr-firmware.js';
import { avrElf, echoProgram, intelHex } from './avr-asm.mjs';

const words = echoProgram();
const first = (program, n = words.length) => [...program.slice(0, n)];

test('an Intel HEX and an ELF: the program\'s words in the flash, the rest erased to 0', () => {
  const h = readFirmware('fw/echo.hex', intelHex(words));
  assert.equal(h.error, undefined);
  assert.equal(h.program.length, FLASH_BYTES / 2);
  assert.deepEqual(first(h.program), [...words]);
  assert.equal(h.size, words.length * 2);
  assert.deepEqual(first(h.program, words.length + 4).slice(-4), [0, 0, 0, 0]);
  const e = readFirmware('fw/echo.elf', avrElf(words));
  assert.equal(e.error, undefined);
  assert.deepEqual(first(e.program), [...words], 'the RAM\'s segment (0x800100) is not the flash\'s');
  assert.equal(e.size, words.length * 2);
  assert.deepEqual(readFirmware('FW.HEX', new TextEncoder().encode(intelHex(words))).size, words.length * 2, 'a .hex given as bytes');
});

test('an Intel HEX\'s records: extended addresses, CR LF, blank lines; its end', () => {
  // an extended linear address (type 04) of 0, an extended segment address (02) of 0x0100 (16 × 0x100 = 0x1000)
  const text = ':020000040000FA\r\n\r\n:0200000002E01C\r\n:020000020100FB\n:02000000FFEE11\n:00000001FF\n:02000400AAAA50\n';
  const r = readIntelHex(text);
  assert.equal(r.error, undefined);
  assert.deepEqual([...r.bytes.slice(0, 2)], [0x02, 0xe0]);
  assert.deepEqual([...r.bytes.slice(0x1000, 0x1002)], [0xff, 0xee]);
  assert.equal(r.size, 0x1002);
  assert.equal(r.bytes[4], 0, 'nothing after the end record');
});

test('the errors: not a program, a broken record, too big for the flash', () => {
  const err = (name, data) => readFirmware(name, data).error;
  assert.equal(err('a.hex', 'hello\n'), 'a.hex: line 1 is not an Intel HEX record');
  assert.equal(err('a.hex', ':0200000002E01D\n'), 'a.hex: line 1: its checksum is wrong');
  assert.equal(err('a.hex', ':0200000002E01C\n:0300000002E01C\n'), 'a.hex: line 2: its record\'s length is not 3 bytes');
  assert.equal(err('a.hex', ':00000001FF\n'), 'a.hex: no program in it (no data record)');
  assert.equal(err('a.hex', ''), 'a.hex: no program in it (no data record)');
  assert.equal(err('a.hex', ':0200000602E016\n'), 'a.hex: line 1: no Intel HEX record of type 6');
  assert.equal(err('a.hex', ':020000040001F9\n:0200000002E01C\n'), 'a.hex: too big for the flash: it reaches 65538 bytes, the flash has 32768');
  assert.equal(err('big.hex', intelHex(new Uint16Array(16385))), 'big.hex: too big for the flash: it reaches 32770 bytes, the flash has 32768');
  assert.equal(err('a.elf', 'text'), 'a.elf: not an ELF file');
  assert.equal(err('a.elf', new Uint8Array(100)), 'a.elf: not an ELF file');
  const elf = avrElf(words);
  assert.equal(err('a.elf', elf.slice(0, 40)), 'a.elf: not an ELF file');
  const b64 = elf.slice(); b64[4] = 2;
  assert.equal(err('a.elf', b64), 'a.elf: not a 32-bit little-endian ELF (an AVR\'s)');
  assert.equal(err('arm.elf', avrElf(words, { machine: 40 })), 'arm.elf: not an AVR program (its machine is 40, an AVR\'s is 83)');
  assert.equal(err('a.elf', elf.slice(0, 120)), 'a.elf: a segment is cut short');
  assert.equal(err('a.elf', avrElf(new Uint16Array(0))), 'a.elf: no program in it (no segment in the flash)');
  assert.equal(err('big.elf', avrElf(new Uint16Array(16385))), 'big.elf: too big for the flash: it reaches 32770 bytes, the flash has 32768');
  assert.equal(err('a.bin', 'x'), 'a.bin: a firmware is a .hex or an .elf');
  assert.equal(readAvrElf(elf).size, words.length * 2);
});
