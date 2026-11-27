// Test helper (not a test file): an AVR program assembled (the flash's words) by Silinx's assembler (#5933,
// core/avr-asm.js; the helper's own assembler of #5477 before), and that program written as an Intel HEX and as an
// ELF, for the AVR node's tests (test/system-sim-avr.test.js, test/avr-firmware.test.js) with no compiler.
//
//   const words = avrAssemble(['ldi r16, 0xff', 'out 0x04, r16', 'loop:', 'rjmp loop']);

import { avrAssemble as assemble, avrMessage } from '../core/avr-asm.js';

/** The program's words (a Uint16Array of the flash's words from 0): Silinx's AVR assembler's (#5933,
 *  core/avr-asm.js), its first error thrown. */
export function avrAssemble(lines) {
  const r = assemble(lines);
  if (r.errors.length) throw new Error(avrMessage(r.errors[0]));
  return r.words;
}

const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
/** A program's Intel HEX (16 bytes a record, at `base`), with its end record. */
export function intelHex(words, base = 0) {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength), lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.subarray(i, i + 16), a = base + i;
    const rec = [chunk.length, (a >> 8) & 0xff, a & 0xff, 0, ...chunk];
    lines.push(`:${rec.map(hex2).join('')}${hex2((-rec.reduce((x, y) => x + y, 0)) & 0xff)}`);
  }
  return `${[...lines, ':00000001FF'].join('\n')}\n`;
}

/** A program's ELF: one loadable segment in the flash at 0, and one in the RAM (0x800100, ignored by the loader). */
export function avrElf(words, { machine = 83 } = {}) {
  const code = new Uint8Array(words.buffer, words.byteOffset, words.byteLength), ram = new Uint8Array([1, 2, 3, 4]);
  const phoff = 52, ph = 32, off = phoff + 2 * ph, b = new Uint8Array(off + code.length + ram.length), dv = new DataView(b.buffer);
  b.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  dv.setUint16(16, 2, true); dv.setUint16(18, machine, true); dv.setUint32(20, 1, true);
  dv.setUint32(28, phoff, true); dv.setUint16(40, 52, true); dv.setUint16(42, ph, true); dv.setUint16(44, 2, true);
  const seg = (i, offset, addr, size) => { const p = phoff + i * ph; dv.setUint32(p, 1, true); dv.setUint32(p + 4, offset, true); dv.setUint32(p + 8, addr, true); dv.setUint32(p + 12, addr, true); dv.setUint32(p + 16, size, true); dv.setUint32(p + 20, size, true); };
  seg(0, off, 0, code.length);
  seg(1, off + code.length, 0x800100, ram.length);
  b.set(code, off); b.set(ram, off + code.length);
  return b;
}

// the ATmega328P's registers (data addresses for sts / lds; I/O addresses for out / in)
export const REG = { DDRB: 0x04, PORTB: 0x05, PIND: 0x09, DDRD: 0x0a, PORTD: 0x0b, UCSR0A: 0xc0, UCSR0B: 0xc1, UCSR0C: 0xc2, UBRR0L: 0xc4, UBRR0H: 0xc5, UDR0: 0xc6 };

/** The reference program: the USART at `ubrr` (103: 9600 baud at 16 MHz), 8N1; sends `text`; then each byte received
 *  is shown on port B (D8..D13) and sent back plus one; D2 (an input with its pull-up) copied on D7. `wait`: about
 *  that many times 48 µs first, its USART not enabled yet (an Arduino core's start-up before Serial.begin, #5561). */
export function echoProgram({ ubrr = 103, text = 'Hi', wait = 0 } = {}) {
  const R = REG;
  return avrAssemble([
    ...(wait ? [`ldi r21, ${wait}`, 'outer:', 'ldi r20, 255', 'inner:', 'dec r20', 'brne inner', 'dec r21', 'brne outer'] : []),
    'ldi r16, 0', `sts ${R.UBRR0H}, r16`, `ldi r16, ${ubrr}`, `sts ${R.UBRR0L}, r16`,
    'ldi r16, 0x06', `sts ${R.UCSR0C}, r16`, 'ldi r16, 0x18', `sts ${R.UCSR0B}, r16`,
    'ldi r16, 0x3f', `out ${R.DDRB}, r16`, 'ldi r16, 0x80', `out ${R.DDRD}, r16`, 'ldi r16, 0x04', `out ${R.PORTD}, r16`,
    ...[...text].flatMap((c) => [`ldi r17, ${c.charCodeAt(0)}`, 'rcall send']),
    'loop:',
    `in r18, ${R.PIND}`, 'ldi r19, 0x04', 'sbrc r18, 2', 'ldi r19, 0x84', `out ${R.PORTD}, r19`,
    `lds r16, ${R.UCSR0A}`, 'sbrs r16, 7', 'rjmp loop',
    `lds r17, ${R.UDR0}`, `out ${R.PORTB}, r17`, 'inc r17', 'rcall send', 'rjmp loop',
    'send:', `lds r16, ${R.UCSR0A}`, 'sbrs r16, 5', 'rjmp send', `sts ${R.UDR0}, r17`, 'ret',
  ]);
}
