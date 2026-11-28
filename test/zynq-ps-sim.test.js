// A Zynq PS's program simulated (#4689, part 5a of #4688): the C interpreter's program mode (core/c-interp.js, program:
// true: no HLS checks, an integer cast to a pointer a memory-mapped register, its hooks; Stop ends the run) and the PS's
// model (core/zynq-ps-sim.js: its UART, GPIO bank 0, M_AXI_GP0's window, its time one clock of the Cortex-A9 per step).
// The examples' programs (uart-zynq's, regs-zynq's) run with no diagnostic: their UART's text, its bytes' times at the
// baud the program sets (against the bit time computed here), their registers' accesses in order, LD4's MIO 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateC, Stop } from '../core/c-interp.js';
import { runPs, psModel, GP0_BASE } from '../core/zynq-ps-sim.js';
import { psOfBoard } from '../core/zynq-ps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PS = psOfBoard('zybo-z7', '20');
const CYCLE = 1e12 / (1333333333.3333333 / 2);   // (the Zybo Z7's Cortex-A9: its ARM PLL / 2, 666.7 MHz)
// (the examples' programs with their delay loops shortened: 20 000 000 iterations are seconds of the A9's time)
const program = (ex) => fs.readFileSync(path.join(ROOT, `examples/${ex}/zybo/ps/main.c`), 'utf8').replace(/20000000u/g, '2000u');
const text = (r) => String.fromCharCode(...r.uart.bytes.map((b) => b.byte));

test('#4689 the C interpreter\'s program mode: a memory-mapped register\'s reads and writes the hooks\', in order; = not read back, |= read then written', () => {
  const src = ['#include <stdint.h>', '#define REG(a) (*(volatile uint32_t *)(a))', '#define B (*(volatile uint8_t *)(0x40000011))',
    'static void set(uint32_t v) { REG(0x40000000) = v; }',
    'int main(void) { set(5); REG(0x40000004) |= 0x10; uint32_t x = REG(0x40000000) + 1; B = (uint8_t)x; REG(0x40000008) = REG(0x40000004) = 7; return (int)x; }'].join('\n');
  const log = [], regs = { 0x40000004: 3n };
  const mmio = { read: (a, n) => { log.push(['r', a.toString(16), n]); return regs[a] ?? 0n; }, write: (a, n, v) => { log.push(['w', a.toString(16), n, v]); regs[a] = v; } };
  const r = simulateC(src, { file: 'p.c', program: true, mmio });
  assert.deepEqual([r.ok, r.error, r.exitCode, r.diagnostics], [true, null, 6, []]);
  assert.deepEqual(log, [['w', '40000000', 4, 5n], ['r', '40000004', 4], ['w', '40000004', 4, 0x13n], ['r', '40000000', 4], ['w', '40000011', 1, 6n],
    ['w', '40000004', 4, 7n], ['w', '40000008', 4, 7n]]);
  // (the same program as HLS sees it: refused, unchanged)
  assert.ok(simulateC(src, { file: 'p.c' }).diagnostics.some((d) => d.severity === 'error' && /'\*' reads a pointer parameter/.test(d.message)));
});

test('#4689 the program mode\'s refusals and its stop: a register not aligned, one of floats; Stop from a hook, the clock\'s every N steps', () => {
  const run = (body, opts = {}) => simulateC(`#include <stdint.h>\nint main(void) { ${body} return 0; }`, { file: 'p.c', program: true, mmio: { read: () => 0n, write: () => {} }, ...opts });
  assert.deepEqual(run('*(volatile uint32_t *)0x40000002 = 1;').error.message, 'the register at 0x40000002 is not aligned to its 4 bytes');
  assert.deepEqual(run('*(volatile float *)0x40000000 = 1;').error.message, 'a memory-mapped register is an integer of 8, 16, 32 or 64 bits (uint32_t, uint16_t, uint8_t)');
  const ticks = [];
  const r = run('for (;;) { }', { clock: { every: 100, fn: (s) => { ticks.push(s); if (ticks.length === 3) throw new Stop('enough'); } } });
  assert.deepEqual([r.ok, r.stopped, r.error, ticks], [true, 'enough', null, [100, 200, 300]]);
  // (with no mmio, a program's cast stays a plain value: no register)
  assert.equal(simulateC('int main(void) { return 2; }', { file: 'p.c', program: true }).exitCode, 2);
});

test('#4689 regs-zynq\'s program on the PS\'s model: its UART\'s text at 115207 baud, 10 bits a byte; its registers written in the map\'s order, count read', () => {
  const r = runPs(program('regs-zynq'), { ps: PS, file: 'main.c', untilNs: 2e6 });
  assert.deepEqual([r.ok, r.error, r.diagnostics], [true, null, []]);
  // (the baud: the UART's 100 MHz / (BRGR 124 × (BDIV 6 + 1)))
  assert.equal(r.uart.baud, 100e6 / (124 * 7));
  const frame = Math.round(10 * 1e12 / r.uart.baud);
  assert.ok(r.uart.bytes.every((b, i) => b.end - b.t === frame && (i === 0 || b.t >= r.uart.bytes[i - 1].end)));
  assert.match(text(r), /^The PL's counter, driven by the Cortex-A9 of Digilent Zybo Z7\r\n(count: 0\r\n)+/);
  // (the PL not simulated here: its registers kept, count never written so 0)
  assert.deepEqual(r.pl.slice(0, 4).map((a) => [a.op, a.off, a.value]), [['write', 12, 1n], ['write', 4, 12500000n], ['write', 0, 1n], ['read', 8, 0n]]);
  assert.ok(r.pl.every((a, i) => i === 0 || a.t >= r.pl[i - 1].t));
  // (its time: one clock of the Cortex-A9 a step, the run to 2 ms)
  assert.equal(r.time, Math.round(r.steps * CYCLE));
  assert.ok(r.time >= 2e9 && r.time < 2e9 + 1000 * CYCLE + 1, String(r.time));
});

test('#4689 uart-zynq\'s program on the PS\'s model: its hello, then LD4 (MIO 7) blinking; the UART\'s FIFO: SR\'s TXFULL waited on, every byte sent', () => {
  const r = runPs(program('uart-zynq'), { ps: PS, untilNs: 1e6 });
  assert.deepEqual([r.ok, r.error, r.diagnostics], [true, null, []]);
  assert.equal(text(r), 'Hello from the Cortex-A9 of Digilent Zybo Z7\r\n');
  assert.ok(r.gpio.length >= 4 && r.gpio.every((g, i) => g.mio === 7 && g.value === (i + 1) % 2), JSON.stringify(r.gpio.slice(0, 4)));
  // (100 bytes at 115200 baud, SR polled before each: all sent, back to back)
  const many = runPs('#include <stdint.h>\n#define REG(a) (*(volatile uint32_t *)(a))\nint main(void) { REG(0xE0001018) = 124; REG(0xE0001034) = 6; REG(0xE0001000) = 0x14; for (int i = 0; i < 100; i++) { while (REG(0xE000102C) & 0x10) { } REG(0xE0001030) = 65 + i % 26; } while (!(REG(0xE000102C) & 0x8)) { } return 0; }',
    { ps: PS, untilNs: 20e6 });
  assert.deepEqual([many.ok, many.uart.bytes.length], [true, 100]);
  const frame = Math.round(10 * 1e12 / many.uart.baud);
  assert.ok(many.uart.bytes.every((b, i) => i === 0 || b.t === many.uart.bytes[i - 1].end));
  // (it waited for TXEMPTY: its time past the last byte's end)
  assert.ok(many.time >= many.uart.bytes.at(-1).end && many.uart.bytes.at(-1).end - many.uart.bytes[0].t === 100 * frame);
  // (not polled: the FIFO's 64 bytes and the one shifting out kept, the others lost)
  const lost = runPs('#include <stdint.h>\nint main(void) { *(volatile uint32_t *)0xE0001000 = 0x14; for (int i = 0; i < 100; i++) *(volatile uint32_t *)0xE0001030 = 65; return 0; }', { ps: PS });
  assert.equal(lost.uart.bytes.length, 65);
  // (its baud the UART's reset one: BRGR 0x28B, BDIV 15, 9600)
  assert.equal(lost.uart.baud, 100e6 / (651 * 16));
  // (TX off: nothing sent)
  assert.equal(runPs('#include <stdint.h>\nint main(void) { *(volatile uint32_t *)0xE0001030 = 65; return 0; }', { ps: PS }).uart.bytes.length, 0);
});

test('#4689 the PS\'s model: GPIO bank 0\'s masked writes, its pins as driven; M_AXI_GP0 given to the PL; an address it has no register at stops the run, said', () => {
  const m = psModel(PS);
  m.write(0xE000A204, 4, 0xffn, 0); m.write(0xE000A208, 4, 0x0fn, 0);
  m.write(0xE000A040, 4, 0xa5n, 10);
  // (MASK_DATA_0_LSW: bits 0-3 written to 0b0011, the others kept by the mask 0xfff0)
  m.write(0xE000A000, 4, (0xfff0n << 16n) | 0x3n, 20);
  assert.equal(m.read(0xE000A040, 4, 30), 0xa3n);
  // (the pins: the outputs enabled only, bits 0-3)
  assert.equal(m.read(0xE000A060, 4, 30), 0x3n);
  assert.deepEqual(m.gpio.map((g) => [g.mio, g.value, g.t]), [[0, 1, Math.round(10 * CYCLE)], [2, 1, Math.round(10 * CYCLE)], [2, 0, Math.round(20 * CYCLE)], [1, 1, Math.round(20 * CYCLE)]]
    .sort((a, b) => a[2] - b[2] || a[0] - b[0]));
  // (MASK_DATA_0_MSW: bit 16 set)
  m.write(0xE000A004, 4, (0xfffen << 16n) | 0x1n, 40);
  assert.equal(m.read(0xE000A040, 4, 50), 0x100a3n);
  const pl = { log: [], read(off, t) { this.log.push(['read', off, t]); return 42n; }, write(off, v, t) { this.log.push(['write', off, v, t]); } };
  const r = runPs(`#include <stdint.h>\nint main(void) { *(volatile uint32_t *)${GP0_BASE + 8} = 3; return (int)*(volatile uint32_t *)0x40000010; }`, { ps: PS, pl });
  assert.deepEqual([r.ok, pl.log.map((x) => x.slice(0, 3))], [true, [['write', 8, 3n], ['read', 16, pl.log[1]?.[2]]]]);
  const bad = runPs('#include <stdint.h>\nint main(void) { return (int)*(volatile uint32_t *)0xF8000100; }', { ps: PS });
  assert.deepEqual([bad.ok, bad.error.message], [false, 'the program reads 0xF8000100, where the PS\'s model has no register (its UART1, GPIO bank 0 and M_AXI_GP0\'s window 0x40000000 to 0x7FFFFFFF are simulated)']);
});
