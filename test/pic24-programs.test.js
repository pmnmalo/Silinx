// Small PIC24 programs on the emulator (#5480), from reset through XC16's HEX: a multiply and divide routine called
// for a table of operands, checked against the integers' results and its cycles counted by hand; an
// interrupt-driven counter (Timer1's interrupt, IRQ 3, raised every 1000 cycles by a clock event as #5481's timer
// will) through a Pic24Node; a sum over a table of constants in the program memory read through PSV and through
// TBLRDL, both the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPU, Pic24Node, writeHex, parseHex } from '../packages/silinx-pic24/src/index.js';
import { pic24Assemble } from './pic24-asm.mjs';

const START = [
  'goto main',
  '.org 0x200',
  // XC16's start-up in short: the stack, its limit, the EDS window's pages, every W written
  'main: mov #0x0900, w15', 'mov #0x0ffe, w0', 'mov w0, splim', 'mov #1, w0', 'mov w0, dsrpag', 'mov w0, dswpag',
];

function boot(lines, opts = {}) {
  const { words, labels } = pic24Assemble([...START, ...lines]);
  return { cpu: new CPU(parseHex(writeHex(words)).program, opts), labels };
}

test('#5480 a routine: (a * b) / c with MUL.UU, then REPEAT #17 and DIV.UD; called for each of a table\'s rows', () => {
  const rows = [[1000, 3000, 7], [65535, 65535, 65535], [12345, 6789, 1000], [2, 3, 4], [40000, 2, 3]];
  const { cpu, labels } = boot([
    'mov #0x1000, w8', 'mov #0x1100, w9', `mov #${rows.length}, w10`,
    'next: mov [w8++], w4', 'mov [w8++], w5', 'mov [w8++], w6', 'rcall muldiv', 'mov w0, [w9++]', 'mov w1, [w9++]',
    'dec w10, w10', 'bra nz, next',
    'done: bra done',
    // muldiv: W1:W0 = W4 * W5; W0 = W1:W0 / W6, W1 the remainder (1 + 1 + 18 + 3 cycles)
    'muldiv: mul.uu w4, w5, w2', 'repeat #17', 'div.ud w2, w6', 'return',
  ]);
  rows.forEach(([a, b, c], i) => { cpu.mem[0x800 + 3 * i] = a; cpu.mem[0x801 + 3 * i] = b; cpu.mem[0x802 + 3 * i] = c; });
  let n = 0;
  while (cpu.pc !== labels.done && n++ < 10000) cpu.step();
  rows.forEach(([a, b, c], i) => {
    const p = a * b, q = Math.floor(p / c);
    assert.deepEqual([cpu.mem[0x880 + 2 * i], cpu.mem[0x881 + 2 * i]], [q & 0xffff, p % c], `${a} * ${b} / ${c}`);
  });
  assert.deepEqual(cpu.log, []);
  // the cycles by hand: the start-up's GOTO (2) and 6 MOVs, 3 MOVs; each row 3 MOVs, RCALL (2), MUL (1), REPEAT (1),
  // DIV (18), RETURN (3), 2 MOVs, DEC, BRA (2; 1 the last)
  assert.equal(cpu.cycles, 2 + 6 + 3 + rows.length * (3 + 2 + 1 + 1 + 18 + 3 + 2 + 1 + 2) - 1);
});

test('#5480 an interrupt-driven counter: Timer1\'s IRQ 3 every 1000 cycles, its ISR counting in RAM and clearing its flag', () => {
  const { words } = pic24Assemble([
    'goto main', '.org 0x1a', '.word t1isr',   // IRQ 3's vector, at 0x14 + 2 * 3
    '.org 0x200',
    'main: mov #0x0900, w15', 'clr 0x1000', 'mov #0x4000, w0', 'mov w0, ipc0', 'bset iec0, #3',
    'idle: bra idle',
    't1isr: push w0', 'inc 0x1000', 'bclr ifs0, #3', 'pop w0', 'retfie',
  ]);
  const node = new Pic24Node({ hex: writeHex(words), fcy: 16e6 });
  const tick = () => { node.cpu.raise(3); node.cpu.addClockEvent(tick, 1000); };
  node.cpu.addClockEvent(tick, 1000);
  node.run(10500 * 62500);   // 10500 cycles: 10 ticks
  assert.equal(node.cpu.mem[0x800], 10);
  assert.deepEqual([node.cpu.ipl, node.cpu.W(15), node.cpu.mem[0x44]], [0, 0x0900, 0], 'every ISR returned, its flag cleared');
  assert.deepEqual(node.messages(), []);
});

test('#5480 a table of constants in the program memory: summed through PSV (DSRPAG 0x200) and through TBLRDL, alike', () => {
  const table = [3, 141, 5926, 5358, 9793, 2384, 626, 4338];
  const { cpu, labels } = boot([
    // PSV: the table at program address 0x1000 is EA 0x9000 with DSRPAG 0x200 (0x1000 = 0x0000 << 15 | 0x1000)
    'mov #0x200, w0', 'mov w0, dsrpag', 'mov #0x9000, w1', 'clr w2', `repeat #${table.length - 1}`, 'add w2, [w1++], w2',
    // TBLRDL: TBLPAG 0, EA 0x1000
    'clr w0', 'mov w0, tblpag', 'mov #0x1000, w1', 'clr w3', `mov #${table.length}, w4`,
    'tloop: tblrdl [w1++], w5', 'add w3, w5, w3', 'dec w4, w4', 'bra nz, tloop',
    'done: bra done',
    '.org 0x1000', ...table.map((v) => `.word ${v}`),
  ]);
  let n = 0;
  while (cpu.pc !== labels.done && n++ < 1000) cpu.step();
  const sum = table.reduce((a, b) => a + b, 0) & 0xffff;
  assert.deepEqual([cpu.W(2), cpu.W(3), cpu.log], [sum, sum, []]);
});
