// The PIC24FJ1024GB610's A/D converter (#5481, packages/silinx-pic24/src/adc.js) with the Explorer 16/32's
// potentiometer (R6, AN5) and TC1047A (AN4): a conversion's code against the input's voltage (10 and 12 bits, AVDD
// 3.3 V), FORM's formats, the sampling by the program (SAMP), the auto-convert (SSRC 0111, SAMC, ASAM), Timer3's
// trigger, CSCNA's scan with BUFREGEN, SMPI's interrupt, the conversion's time (12 or 14 TAD); a program showing the
// potentiometer's position on the LEDs. At Fcy = 1 MHz (forced): TAD = (ADCS + 1) µs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceWith } from './pic24-lib.mjs';
import { Explorer1632, Pic24Node } from '../packages/silinx-pic24/src/index.js';
import { pic24Assemble } from './pic24-asm.mjs';

const FWDT_OFF = { FWDT: 0xffff9f };
const AD1CON1 = 0x0746, AD1CON2 = 0x0748, AD1CON3 = 0x074a, AD1CHS = 0x074c, AD1CSSL = 0x0750, BUF0 = 0x0712;
const dev1 = async () => { const d = await deviceWith(['bra $'], { config: FWDT_OFF, fcy: 1e6 }); return { ...d, board: new Explorer1632(d.dev) }; };
// one conversion by the program: SAMP set then cleared, DONE awaited
function convert(d, chs) {
  const { cpu, mcu } = d;
  cpu.wr(AD1CHS, chs, 0);
  cpu.wr(AD1CON1, cpu.rd(AD1CON1, 0) | 2, 0);
  mcu.runTo(mcu.time + 10e6);
  cpu.wr(AD1CON1, cpu.rd(AD1CON1, 0) & ~2, 0);
  const t0 = mcu.time;
  while (!(cpu.rd(AD1CON1, 0) & 1) && mcu.time < t0 + 1e9) cpu.step();
  return { code: cpu.mem[BUF0 >> 1], took: mcu.time - t0 };
}

test('#5481 a conversion: the code of the input\'s voltage against AVDD (10 bits, 12 with MODE12); its 12 or 14 TADs', async () => {
  const d = await dev1();
  d.cpu.wr(AD1CON3, 0x0001, 0);   // TAD = 2 µs
  d.cpu.wr(AD1CON1, 0x8000, 0);
  d.board.setPotentiometer(0.5);
  let r = convert(d, 5);
  assert.equal(r.code, 512);
  assert.ok(r.took >= 24e6 && r.took < 27e6, `${r.took}`);
  d.board.setPotentiometer(1);
  assert.equal(convert(d, 5).code, 1023, 'full scale: 1023');
  d.board.setTemperature(25);   // 0.75 V
  assert.equal(convert(d, 4).code, Math.round(0.75 / 3.3 * 1024));
  d.cpu.wr(AD1CON1, 0x8400, 0);
  d.board.setPotentiometer(0.25);
  r = convert(d, 5);
  assert.deepEqual([r.code, r.took >= 28e6], [1024, true], '12 bits: 4096 / 4, 14 TADs');
  assert.throws(() => d.dev.adc.setAnalog('AN24', 1), /no analog input 'AN24' \(AN0-AN23\)/);
});

test('#5481 FORM: unsigned, signed, fractional and signed fractional; AVDD and AVSS as inputs', async () => {
  const d = await dev1();
  d.board.setPotentiometer(0.75);   // 768 of 1024
  for (const [form, want] of [[0, 768], [1, 256], [2, 768 << 6], [3, 256 << 6]]) {
    d.cpu.wr(AD1CON1, 0x8000 | (form << 8), 0);
    assert.equal(convert(d, 5).code, want, `FORM ${form}`);
  }
  d.cpu.wr(AD1CON1, 0x8000, 0);
  assert.deepEqual([convert(d, 0x1e).code, convert(d, 0x1d).code], [1023, 0], 'AVDD, AVSS');
});

test('#5481 the auto-convert (SSRC 0111, SAMC, ASAM): SMPI + 1 conversions then the ADC1 interrupt; CSCNA\'s scan with BUFREGEN', async () => {
  const d = await dev1();
  d.board.setPotentiometer(0.5); d.board.setTemperature(50);
  d.cpu.wr(AD1CON3, 0x0300, 0);                 // SAMC 3 TAD, TAD = 1 µs
  d.cpu.wr(AD1CON2, 0x0c04, 0);                 // BUFREGEN, CSCNA, SMPI 1: every second conversion
  d.cpu.wr(AD1CSSL, 0x0030, 0);                 // AN4, AN5
  d.cpu.wr(AD1CON1, 0x8074, 0);                 // ADON, SSRC 0111, ASAM
  const t0 = d.mcu.time;
  d.mcu.runTo(t0 + 2 * 15e6 + 2e6);
  assert.deepEqual([d.cpu.mem[(BUF0 >> 1) + 4], d.cpu.mem[(BUF0 >> 1) + 5]], [Math.round(1.0 / 3.3 * 1024), 512]);
  assert.equal((d.mcu.get(0x0088) >> 13) & 1, 1, 'AD1IF after two');
});

test('#5481 Timer3\'s trigger (SSRC 0010): each of its periods ends the sampling and converts', async () => {
  const d = await dev1();
  d.board.setPotentiometer(0.5);
  d.cpu.wr(0x019e, 99, 0); d.cpu.wr(0x01a2, 0x8000, 0);   // Timer3: 100 µs
  d.cpu.wr(AD1CHS, 5, 0);
  d.cpu.wr(AD1CON1, 0x8024, 0);                          // SSRC 0010, ASAM
  d.mcu.runTo(d.mcu.time + 80e6);
  assert.equal(d.cpu.rd(AD1CON1, 0) & 1, 0, 'no conversion before Timer3\'s period');
  d.mcu.runTo(d.mcu.time + 50e6);
  assert.deepEqual([d.cpu.mem[BUF0 >> 1], (d.mcu.get(0x0088) >> 13) & 1], [512, 1]);
});

test('#5481 a program on the Explorer 16/32: the potentiometer\'s position on the LEDs (its code\'s top 8 bits on RA0-RA7)', () => {
  const { words } = pic24Assemble([
    'goto main', '.org 0x200',
    'main: mov #0xff00, w0', 'mov w0, 0x0662', 'clr 0x066a',      // RA0-7 outputs, digital
    'mov #5, w0', 'mov w0, 0x074c', 'mov #0x0001, w0', 'mov w0, 0x074a', 'mov #0x8000, w0', 'mov w0, 0x0746',
    'loop: bset 0x0746, #1', 'repeat #20', 'nop', 'bclr 0x0746, #1',
    'wait: btss 0x0746, #0', 'bra wait',
    'mov 0x0712, w1', 'lsr w1, #2, w1', 'mov w1, 0x0666', 'bra loop',
  ]);
  const node = new Pic24Node({ program: words, fcy: 1e6 });
  const board = new Explorer1632(node.device);
  for (const share of [0.1, 0.5, 1]) {
    board.setPotentiometer(share);
    node.run(node.time + 200e6);
    const lit = Object.values(board.leds()).reduce((v, on, i) => v | (on ? 1 << i : 0), 0);
    assert.equal(lit, Math.min(1023, Math.round(share * 1024)) >> 2, `R6 at ${share}`);
  }
});
