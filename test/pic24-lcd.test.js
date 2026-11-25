// The PIC24FJ1024GB610's EPMP (#5481, packages/silinx-pic24/src/pmp.js) and the Explorer 16/32's character LCD on it
// (lcd.js, HD44780-compatible): the LCD's instructions (function set, display control, entry mode, clear, home, shifts,
// the DDRAM's and CGRAM's addresses), its busy flag and its instructions' times, a write while busy ignored and said,
// its 4-bit mode; the EPMP's chip selects in the EDS, RS on PMA0, a word as two cycles, its interrupt; a program
// printing two lines through it, polling the busy flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith, runUntil } from './pic24-lib.mjs';
import { CharacterLcd, Explorer1632 } from '../packages/silinx-pic24/src/index.js';

const FWDT_OFF = { FWDT: 0xffff9f };

function lcdAt() {
  const clock = { t: 0 }, said = [];
  const lcd = new CharacterLcd({ now: () => clock.t, say: (s) => said.push(s) });
  const cmd = (v, wait = 2e9) => { lcd.write(0, v); clock.t += wait; };
  const text = (s) => { for (const c of s) { lcd.write(1, c.charCodeAt(0)); clock.t += 50e6; } };
  return { lcd, clock, said, cmd, text };
}

test('#5481 the LCD: off at power-on; function set, display on, entry mode, then text on its two lines', () => {
  const { lcd, cmd, text } = lcdAt();
  assert.deepEqual(lcd.lines(), [' '.repeat(16), ' '.repeat(16)]);
  cmd(0x38); cmd(0x0c); cmd(0x06); cmd(0x01);
  text('Hello, Explorer!');
  cmd(0xc0);
  text('PIC24');
  assert.deepEqual(lcd.lines(), ['Hello, Explorer!', 'PIC24           ']);
  assert.equal(lcd.read(0) & 0x7f, 0x45, 'the address counter: line 2, column 5');
  cmd(0x02);
  assert.equal(lcd.read(0), 0, 'home');
  cmd(0x18);   // the display shifted left
  assert.deepEqual(lcd.lines(), ['ello, Explorer! ', 'IC24            ']);
  cmd(0x01);
  assert.deepEqual(lcd.lines(), [' '.repeat(16), ' '.repeat(16)]);
});

test('#5481 the LCD\'s busy flag: 37 µs an instruction, 1.52 ms a clear; a write while busy ignored, said', () => {
  const { lcd, clock, said } = lcdAt();
  lcd.write(0, 0x38);
  assert.equal(lcd.read(0) & 0x80, 0x80);
  clock.t += 38e6;
  assert.equal(lcd.read(0) & 0x80, 0);
  lcd.write(0, 0x01);
  clock.t += 1000e6;
  lcd.write(0, 0x0c);
  assert.deepEqual(said, ['the LCD was written while busy (its busy flag set): the write is ignored']);
  assert.equal(lcd.on, false);
});

test('#5481 the LCD\'s 4-bit mode: each byte two nibbles on D7-D4, the high one first; the CGRAM\'s characters', () => {
  const { lcd, clock } = lcdAt();
  const nib = (rs, v) => { lcd.write(rs, v & 0xf0); lcd.write(rs, (v << 4) & 0xf0); clock.t += 2e9; };
  lcd.write(0, 0x20); clock.t += 1e8;   // 8-bit mode's function set to 4 bits (one write)
  nib(0, 0x28); nib(0, 0x0c); nib(0, 0x01);
  for (const c of 'OK') nib(1, c.charCodeAt(0));
  assert.equal(lcd.lines()[0], 'OK              ');
  nib(0, 0x40); for (let i = 0; i < 8; i++) nib(1, 0x1f);   // CGRAM character 0
  nib(0, 0x82); nib(1, 0);
  assert.equal(lcd.lines()[0], 'OK␀             ');
});

// the EPMP in master mode with CS1 at EDS 0x020000 (PMCS1BS 0x0200): EA 0x8000 with DSxPAG 4 is RS 0, 0x8001 RS 1
const PMP_ON = ['mov #0x0200, w0', 'mov w0, 0x0132', 'mov #0x8300, w0', 'mov w0, 0x0128', 'mov #4, w0', 'mov w0, 0x0032', 'mov w0, 0x0034', 'mov #0x8000, w1'];
const SEND = (v, rs) => [`mov #${v}, w0`, 'call busy', `mov.b w0, [w1+${rs}]`];

test('#5481 a program printing two lines on the Explorer 16/32\'s LCD through the EPMP, polling its busy flag', async () => {
  const msg = (s) => [...s].flatMap((c) => SEND(c.charCodeAt(0), 1));
  const { dev, cpu, labels } = await deviceWith([
    'mov #0x0900, w15', ...PMP_ON,
    ...SEND(0x38, 0), ...SEND(0x0c, 0), ...SEND(0x06, 0), ...SEND(0x01, 0),
    ...msg('Silinx PIC24'), ...SEND(0xc0, 0), ...msg('Explorer 16/32'),
    'done: bra done',
    'busy: mov.b [w1], w2', 'btsc w2, #7', 'bra busy', 'return',
  ], { config: FWDT_OFF, fcy: 16e6 });
  const board = new Explorer1632(dev);
  assert.ok(runUntil(cpu, labels.done, 2e6));
  assert.deepEqual(board.lcd.lines(), ['Silinx PIC24    ', 'Explorer 16/32  ']);
  assert.deepEqual(cpu.log, []);
});

test('#5481 the EPMP: off, an EDS access is nothing (said); a word is two byte cycles, the low first; IRQM 01\'s interrupt', async () => {
  const { dev, mcu, cpu } = await deviceWith(['bra $'], { config: FWDT_OFF });
  const seen = [];
  dev.pmp.attach(1, { write: (a, v) => seen.push([a, v]), read: (a) => 0x40 + a });
  cpu.wr(0x0034, 4, 0); cpu.wr(0x0032, 4, 0);
  cpu.wr(0x8000, 0x12, 1);
  assert.match(cpu.log[0].text, /an EDS access at 0x020000 with the EPMP off \(PMCON1's PMPEN, MODE 11\): nothing there/);
  cpu.wr(0x0132, 0x0200, 0); cpu.wr(0x0128, 0x8301, 0);
  cpu.wr(0x8004, 0xbeef, 0);
  assert.deepEqual(seen, [[4, 0xef], [5, 0xbe]]);
  assert.equal(cpu.rd(0x8002, 0), 0x4342);
  assert.equal((mcu.get(0x008c) >> 13) & 1, 1, 'PMPIF');
});
