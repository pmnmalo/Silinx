// Silinx's AVR assembler (#5933, core/avr-asm.js) against an independent reference: every instruction form of the
// ATmega328P assembled by GNU avr-as 2.26 (Arduino's avr-gcc 7.3.0-atmel3.6.1-arduino7, linked by avr-ld so that its
// relative branches are resolved; jmp and call written there with byte addresses, branches with `.+n`: here their
// avrasm2 forms) gives these words; the Arduino examples' programs assembled to their shipped .hex, byte for byte; the
// directives, the ATmega328P's names, the expressions; its errors and warnings by line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avrAssemble, avrMessage, avrHex, MNEMONICS } from '../core/avr-asm.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const words = (src) => { const r = avrAssemble(src); assert.deepEqual(r.errors.map(avrMessage), []); assert.deepEqual(r.warnings, []); return [...r.words]; };
const errors = (src) => avrAssemble(src, { file: 't.asm' }).errors.map(avrMessage);

// [a form, its words as avr-as assembles it]
const FORMS = [
  ['add r1, r31', 0x0e1f], ['adc r16, r2', 0x1d02], ['sub r31, r0', 0x19f0], ['sbc r5, r17', 0x0a51],
  ['and r10, r20', 0x22a4], ['or r0, r0', 0x2800], ['eor r24, r25', 0x2789], ['cp r3, r19', 0x1633],
  ['cpc r30, r1', 0x05e1], ['cpse r7, r23', 0x1277], ['mov r12, r28', 0x2ecc], ['mul r31, r15', 0x9dff],
  ['lsl r18', 0x0f22], ['rol r9', 0x1c99], ['tst r27', 0x23bb], ['clr r20', 0x2744], ['com r1', 0x9410],
  ['neg r30', 0x95e1], ['swap r17', 0x9512], ['inc r2', 0x9423], ['asr r29', 0x95d5], ['lsr r11', 0x94b6],
  ['ror r25', 0x9597], ['dec r16', 0x950a], ['push r0', 0x920f], ['pop r31', 0x91ff], ['subi r16, 255', 0x5f0f],
  ['sbci r31, 0x5a', 0x45fa], ['andi r20, 0x0f', 0x704f], ['ori r17, 0xf0', 0x6f10], ['sbr r18, 0x81', 0x6821],
  ['cbr r19, 0x81', 0x773e], ['cpi r30, 42', 0x32ea], ['ldi r16, 0xa5', 0xea05], ['ser r23', 0xef7f],
  ['adiw r24, 63', 0x96cf], ['adiw r30, 1', 0x9631], ['sbiw r26, 33', 0x9791], ['sbiw r28, 0', 0x9720],
  ['muls r16, r31', 0x020f], ['mulsu r23, r16', 0x0370], ['fmul r17, r22', 0x031e], ['fmuls r20, r21', 0x03c5],
  ['fmulsu r19, r18', 0x03ba], ['movw r30, r24', 0x01fc], ['movw r0, r2', 0x0101], ['jmp 0x1fff', 0x940c, 0x1fff],
  ['call 0x91a', 0x940e, 0x091a], ['ijmp', 0x9409], ['icall', 0x9509], ['ret', 0x9508], ['reti', 0x9518],
  ['nop', 0x0000], ['sleep', 0x9588], ['break', 0x9598], ['wdr', 0x95a8], ['spm', 0x95e8], ['brbs 6, PC+6', 0xf02e],
  ['brbc 3, PC-3', 0xf7e3], ['bset 7', 0x9478], ['bclr 0', 0x9488], ['sec', 0x9408], ['clc', 0x9488],
  ['sez', 0x9418], ['clz', 0x9498], ['sen', 0x9428], ['cln', 0x94a8], ['sev', 0x9438], ['clv', 0x94b8],
  ['ses', 0x9448], ['cls', 0x94c8], ['seh', 0x9458], ['clh', 0x94d8], ['set', 0x9468], ['clt', 0x94e8],
  ['sei', 0x9478], ['cli', 0x94f8], ['sbrc r5, 7', 0xfc57], ['sbrs r30, 0', 0xffe0], ['bst r19, 3', 0xfb33],
  ['bld r2, 6', 0xf826], ['sbic 0x1f, 1', 0x99f9], ['sbis 0x00, 7', 0x9b07], ['sbi 0x05, 5', 0x9a2d],
  ['cbi 0x1e, 0', 0x98f0], ['in r16, 0x3f', 0xb70f], ['in r31, 0x00', 0xb1f0], ['out 0x3e, r1', 0xbe1e],
  ['out 0x05, r24', 0xb985], ['lds r20, 0x08ff', 0x9140, 0x08ff], ['sts 0x0100, r9', 0x9290, 0x0100],
  ['ld r0, X', 0x900c], ['ld r1, X+', 0x901d], ['ld r2, -X', 0x902e], ['ld r3, Y', 0x8038], ['ld r4, Y+', 0x9049],
  ['ld r5, -Y', 0x905a], ['ld r6, Z', 0x8060], ['ld r7, Z+', 0x9071], ['ld r8, -Z', 0x9082], ['st X, r9', 0x929c],
  ['st X+, r10', 0x92ad], ['st -X, r11', 0x92be], ['st Y, r12', 0x82c8], ['st Y+, r13', 0x92d9],
  ['st -Y, r14', 0x92ea], ['st Z, r15', 0x82f0], ['st Z+, r16', 0x9301], ['st -Z, r17', 0x9312],
  ['ldd r18, Y+63', 0xad2f], ['ldd r19, Z+1', 0x8131], ['ldd r20, Y+32', 0xa148], ['std Y+7, r21', 0x835f],
  ['std Z+40, r22', 0xa760], ['lpm', 0x95c8], ['rjmp PC+51', 0xc032], ['rcall PC-24', 0xdfe7], ['lpm r23, Z', 0x9174], ['lpm r24, Z+', 0x9185],
];

test('#5933 every instruction form gives avr-as\'s words', () => {
  for (const [src, ...expected] of FORMS) assert.deepEqual(words([src]), expected, src);
  // every mnemonic of the assembler is in the reference (its aliases too: brcs, breq…), but the branches' aliases, which
  // are brbs / brbc with their flag
  const tried = new Set(FORMS.map(([s]) => s.split(/\s/)[0]));
  assert.deepEqual(MNEMONICS.filter((m) => !tried.has(m) && !/^br(?!bs|bc|eak)/.test(m)), []);
  // the branches: each alias is brbs / brbc on its flag
  const BR = { brcs: 'brbs 0', brlo: 'brbs 0', brcc: 'brbc 0', brsh: 'brbc 0', breq: 'brbs 1', brne: 'brbc 1', brmi: 'brbs 2', brpl: 'brbc 2',
    brvs: 'brbs 3', brvc: 'brbc 3', brlt: 'brbs 4', brge: 'brbc 4', brhs: 'brbs 5', brhc: 'brbc 5', brts: 'brbs 6', brtc: 'brbc 6', brie: 'brbs 7', brid: 'brbc 7' };
  for (const [alias, base] of Object.entries(BR)) assert.deepEqual(words([`${alias} PC-20`]), words([`${base}, PC-20`]), alias);
});

test('#5933 the Arduino examples\' programs assemble to their shipped .hex, byte for byte, with no warning', () => {
  for (const ex of ['uart-avr/uno/hello', 'spi-avr/uno/spi', 'i2c-avr/uno/i2c', 'regs-avr/uno/regs']) {
    const r = avrAssemble(fs.readFileSync(path.join(ROOT, 'examples', `${ex}.asm`), 'utf8'), { file: `${ex}.asm` });
    assert.deepEqual(r.errors, [], ex);
    assert.deepEqual(r.warnings, [], ex);   // no warnings
    assert.equal(r.hex, fs.readFileSync(path.join(ROOT, 'examples', `${ex}.hex`), 'utf8'), ex);
  }
});

test('#5933 the ATmega328P\'s names, .def, .equ, .set, expressions', () => {
  assert.deepEqual(words(['.include "m328Pdef.inc"', '.device ATmega328P', 'sbi PORTB, PB5', 'sts UCSR0B, r16', 'lds r17, UCSR0A', 'sbrs r17, UDRE0', 'out SPL, r16', 'in r0, SREG']),
    [0x9a2d, 0x9300, 0x00c1, 0x9110, 0x00c0, 0xff15, 0xbf0d, 0xb60f]);
  assert.deepEqual(words(['.def temp = r16', '.equ BAUD = 9600', '.equ UBRR = 16000000 / (16 * BAUD) - 1', 'ldi temp, low(UBRR)', 'ldi XH, high(RAMEND)', 'ldi ZL, lo8(0x1234)', 'ldi ZH, hi8(0x1234)']),
    [0xe607, 0xe0b8, 0xe3e4, 0xe1f2]);
  assert.deepEqual(words(['.set N = 1', 'ldi r16, N', '.set N = N << 3', 'ldi r16, N | 0b1', "ldi r17, 'A' + 1", 'ldi r18, $ff & ~0x0f', 'ldi r19, (2 + 3) * 4 % 7', 'ldi r20, -1']),
    [0xe001, 0xe009, 0xe412, 0xef20, 0xe036, 0xef4f]);
  // the vectors' word addresses; PC; labels before their definition
  assert.deepEqual(words(['.org 0', 'rjmp reset', '.org INT0addr', 'rjmp isr', '.org USART_RXaddr', 'reti', 'reset: rjmp PC', 'isr: reti']),
    [0xc024, 0xffff, 0xc023, ...Array(33).fill(0xffff), 0x9518, 0xcfff, 0x9518]);
});

test('#5933 .db, .dw, .byte, the segments, EEPROM', () => {
  assert.deepEqual(words(['.db "Hi", 0x0d, 10', '.dw 0x1234, -1', 'msg: .db "ab\\n", 0']), [0x6948, 0x0a0d, 0x1234, 0xffff, 0x6261, 0x000a]);
  const r = avrAssemble(['.dseg', 'buf: .byte 4', 'n: .byte 1', '.eseg', 'cfg: .db 1, 2', '.dw 0x0304', '.cseg', 'lds r16, n', 'ldi r17, low(buf)']);
  assert.deepEqual(r.errors, []);
  assert.deepEqual([...r.words], [0x9100, 0x0104, 0xe010]);
  assert.deepEqual([...r.eeprom], [1, 2, 4, 3]);
  assert.deepEqual(r.labels, { buf: 0x100, n: 0x104, cfg: 0 });
  // an odd .db in the flash is padded, and said
  const odd = avrAssemble(['.db 1, 2, 3'], { file: 'x.asm' });
  assert.deepEqual([...odd.words], [0x0201, 0x0003]);
  assert.deepEqual(odd.warnings.map(avrMessage), ['x.asm:1: .db with an odd number of bytes (3): a 0 byte is added to fill its last word']);
});

test('#5933 the Intel HEX: 16 bytes a record from each run\'s start, the gaps left out, its end', () => {
  const r = avrAssemble(['nop', 'nop', '.org 0x40', 'rjmp PC']);
  assert.equal(r.hex, ':0400000000000000FC\n:02008000FFCFB0\n:00000001FF\n');
  assert.equal(avrHex([]), ':00000001FF\n');
});

test('#5933 a label defined twice is refused, naming both lines; every line\'s error by file and line', () => {
  assert.deepEqual(errors(['wait: dec r16', 'brne wait', 'wait: nop', 'rjmp wait']), ['t.asm:3: the label \'wait\' is defined twice: at line 1 and at line 3']);
  assert.deepEqual(errors(['pc: nop']), ['t.asm:1: \'pc\' is the program counter\'s name (PC), not a label\'s']);
  assert.deepEqual(errors(['frob r1', 'ldi r1, 3', 'ldi r16, 256', 'adiw r25, 1', 'movw r1, r2', 'rjmp nowhere', 'in r0, 64', 'ldd r0, Y+64', 'ld r0, W', 'nop r1', '.org 0x5', 'nop', '.org 0x5', 'nop']), [
    't.asm:1: no instruction frob',
    't.asm:2: r1: a register r16..r31 expected',
    't.asm:3: K 256 not in -128..255',
    't.asm:4: r25: r24, r26, r28 or r30 expected',
    't.asm:5: movw: even registers (a pair\'s low one)',
    't.asm:6: unknown name: nowhere',
    't.asm:7: A 64 not in 0..63',
    't.asm:8: q 64 not in 0..63',
    't.asm:9: not a pointer: W (X, X+, -X, Y, Y+, -Y, Z, Z+, -Z)',
    't.asm:10: no operand',
    't.asm:14: word address 0x5 written twice: at line 12 and at line 14',
  ]);
  assert.deepEqual(errors(['rjmp far', '.org 0x900', 'far: breq near', '.org 0x980', 'near: nop']), ['t.asm:1: a relative jump of 2303 not in -2048..2047', 't.asm:3: a relative jump of 127 not in -64..63']);
  assert.deepEqual(errors(['.include "m2560def.inc"', '.device atmega2560', '.macro m', '.dseg', '.db 1', '.cseg', '.byte 2', '.equ A = 1', '.equ A = 2', '.foo']), [
    't.asm:1: .include "m2560def.inc": only the ATmega328P\'s names, "m328Pdef.inc", are built in',
    't.asm:2: .device atmega2560: the assembler is the ATmega328P\'s',
    't.asm:3: .macro: macros and conditional assembly are not supported yet',
    't.asm:5: .db in the data segment: .byte reserves it (its values are the program\'s to write)',
    't.asm:7: .byte reserves data memory or EEPROM (.dseg, .eseg)',
    't.asm:9: .equ A: defined again (.set changes a name)',
    't.asm:10: no directive .foo',
  ]);
  // .exit ends the source
  assert.deepEqual(errors(['nop', '.exit', 'frob']), []);
});

test('#5933 the manual\'s undefined combinations are warnings: a pointer\'s own byte loaded or stored as it changes', () => {
  const r = avrAssemble(['ld r26, X+', 'st -Y, r29', 'lpm r31, Z+', 'ld r26, X', 'ld r16, X+'], { file: 'u.asm' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings.map(avrMessage), [
    'u.asm:1: ld with r26, a byte of the pointer X+ it changes: the result is undefined',
    'u.asm:2: st with r29, a byte of the pointer -Y it changes: the result is undefined',
    'u.asm:3: lpm with r31, a byte of the pointer Z+ it changes: the result is undefined',
  ]);
});

test('#5933 the ATmega328P\'s names are scripts/avr-symbols.mjs\'s output of avr-libc\'s iom328p.h (skipped where no avr-libc is installed)', async (t) => {
  const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const header = [path.join(os.homedir(), 'Library/Arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/avr/include/avr/iom328p.h'),
    path.join(os.homedir(), '.arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/avr/include/avr/iom328p.h'),
    '/usr/lib/avr/include/avr/iom328p.h'].find((f) => fs.existsSync(f));
  if (!header) { t.skip('no avr-libc header here (Arduino\'s avr-gcc 7.3.0 or Debian\'s avr-libc)'); return; }
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/avr-symbols.mjs'), header], { encoding: 'utf8' });
  // (another avr-libc's header: the same names and addresses, its notice's text maybe not)
  const table = (s) => s.slice(s.indexOf('/** The registers'));
  assert.equal(table(out), table(fs.readFileSync(path.join(ROOT, 'core/avr-m328p.js'), 'utf8')));
});
