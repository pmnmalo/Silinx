// The PIC24 emulator's data movement and its bus (#5480, packages/silinx-pic24/src/exec-move.js, operands.js,
// cpu.js): the addressing modes in byte and word modes (DS70000157 4.1), the MOV forms, MOV.D, PUSH and POP, LNK and
// ULNK, SE, ZE, SWAP, EXCH, DAW.B, the table reads and writes, the program space visibility and the EDS window
// (DS30010074 4.2.5, 4.3), the cycles (two for MOV.D and the table instructions, a PSV or EDS read's more, a RAW
// stall's one), the address and stack errors' traps, the resets, the CPU registers' read-only bits, the state saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exec, cpuWith, set, get } from './pic24-lib.mjs';
import { CPU } from '../packages/silinx-pic24/src/index.js';

test('#5480 the indirect modes: [Wn], [Wn++], [Wn--], [++Wn], [--Wn] as source and destination, a byte\'s step 1, a word\'s 2', () => {
  const MEM = { 'Data 1000': 0x1122, 'Data 1002': 0x3344, 'Data 0FFE': 0x5566 };
  const cases = [
    // [source, its EA, W1 after] for words and bytes
    ['[w1]', 0x1000, 0x1000, 0x1122, 0x22], ['[w1++]', 0x1000, 0x1002, 0x1122, 0x22], ['[w1--]', 0x1000, 0x0ffe, 0x1122, 0x22],
    ['[++w1]', 0x1002, 0x1002, 0x3344, 0x11], ['[--w1]', 0x0ffe, 0x0ffe, 0x5566, 0x55],
  ];
  for (const [mode, , after, word] of cases) {
    const { cpu } = exec(`mov ${mode}, w2`, { ...MEM, W1: 0x1000 });
    assert.deepEqual([cpu.W(2), cpu.W(1)], [word, after], `mov ${mode}, w2`);
  }
  // bytes: the step is 1, [++w1] is 0x1001's byte, [--w1] 0x0FFF's
  const bytes = [['[w1++]', 0x22, 0x1001], ['[w1--]', 0x22, 0x0fff], ['[++w1]', 0x11, 0x1001], ['[--w1]', 0x55, 0x0fff]];
  for (const [mode, b, after] of bytes) {
    const { cpu } = exec(`mov.b ${mode}, w2`, { ...MEM, W1: 0x1000, W2: 0xabcd });
    assert.deepEqual([cpu.W(2), cpu.W(1)], [0xab00 | b, after], `mov.b ${mode}, w2`);
  }
  // destinations
  for (const [mode, ea, after] of [['[w3]', 0x1000, 0x1000], ['[w3++]', 0x1000, 0x1002], ['[w3--]', 0x1000, 0x0ffe], ['[++w3]', 0x1002, 0x1002], ['[--w3]', 0x0ffe, 0x0ffe]]) {
    const { cpu } = exec(`mov w2, ${mode}`, { W2: 0xbeef, W3: 0x1000 });
    assert.deepEqual([get(cpu, ea), cpu.W(3)], [0xbeef, after], `mov w2, ${mode}`);
  }
  const { cpu } = exec('mov.b w2, [w3]', { W2: 0x00ef, W3: 0x1001, 'Data 1000': 0x1234 });
  assert.equal(cpu.mem[0x800], 0xef34, 'a byte to the odd address: the word\'s high byte');
});

test('#5480 MOV\'s forms: #lit16, #lit8, f to Wnd, Wns to f, f {,WREG} with N and Z, [Ws + Slit10], [Ws + Wb]', () => {
  assert.equal(exec('mov #0xfedc, w9').cpu.W(9), 0xfedc);
  assert.equal(exec('mov.b #0x5a, w9', { W9: 0x1234 }).cpu.W(9), 0x125a);
  assert.equal(exec('mov 0x1234, w4', { 'Data 1234': 0x0bad }).cpu.W(4), 0x0bad);
  assert.equal(exec('mov w4, 0x7ffe', { W4: 0x0bad }).cpu.mem[0x3fff], 0x0bad);
  const f = exec('mov 0x1000', { 'Data 1000': 0x8001, SR: 0 }).cpu;
  assert.equal(f.sr, 8, 'MOV f, f: N');
  const w = exec('mov.b 0x1001, wreg', { 'Data 1000': 0x0034, W0: 0x5555, SR: 0 }).cpu;
  assert.deepEqual([w.W(0), w.sr], [0x5500, 2], 'MOV.B f, WREG: the byte 0x00, Z');
  // negative offsets; a word's offset is twice the encoded literal
  assert.equal(exec('mov [w1-0x400], w2', { W1: 0x1400, 'Data 1000': 0x7777 }).cpu.W(2), 0x7777);
  assert.equal(exec('mov.b [w1-1], w2', { W1: 0x1001, W2: 0, 'Data 1000': 0x7788 }).cpu.W(2), 0x88);
  assert.equal(exec('mov w2, [w1+0x3fe]', { W1: 0x1000, W2: 0x4321 }).cpu.mem[(0x13fe) >> 1], 0x4321);
  assert.equal(exec('mov [w1+w4], [w5+w4]', { W1: 0x1000, W4: 0x10, W5: 0x2000, 'Data 1010': 0x9999 }).cpu.mem[0x2010 >> 1], 0x9999);
  // the W registers are memory: MOV f to and from them
  assert.equal(exec('mov 0x0006, w0', { W3: 0x3333 }).cpu.W(0), 0x3333);
  assert.equal(exec('mov w0, 0x0008', { W0: 0x4444 }).cpu.W(4), 0x4444);
});

test('#5480 MOV.D, PUSH and POP (MOV\'s), PUSH.D and POP.D, PUSH and POP f, LNK and ULNK: the stack frames', () => {
  let { cpu } = exec('mov.d w2, w6', { W2: 0x1111, W3: 0x2222 });
  assert.deepEqual([cpu.W(6), cpu.W(7)], [0x1111, 0x2222]);
  ({ cpu } = exec('mov.d [w1++], w4', { W1: 0x1000, 'Data 1000': 0xaaaa, 'Data 1002': 0xbbbb }));
  assert.deepEqual([cpu.W(4), cpu.W(5), cpu.W(1)], [0xaaaa, 0xbbbb, 0x1004], 'MOV.D\'s pointer moves by 4');
  ({ cpu } = exec('mov.d w4, [--w1]', { W1: 0x1004, W4: 1, W5: 2 }));
  assert.deepEqual([cpu.mem[0x800], cpu.mem[0x801], cpu.W(1)], [1, 2, 0x1000]);
  // PUSH, PUSH.D then POP.D, POP: the stack grows up, W15 the next free word
  const p = cpuWith(['push w1', 'push.d w2', 'pop.d w6', 'pop w8', 'push 0x1000', 'pop 0x1002', 'lnk #4', 'ulnk']);
  for (const [k, v] of Object.entries({ W15: 0x0900, W1: 0x1234, W2: 0x5678, W3: 0x9abc, W14: 0x0a00, 'Data 1000': 0x4242 })) set(p.cpu, k, v);
  p.cpu.step(); p.cpu.step();
  assert.deepEqual([p.cpu.W(15), p.cpu.mem[0x480], p.cpu.mem[0x481], p.cpu.mem[0x482]], [0x0906, 0x1234, 0x5678, 0x9abc]);
  p.cpu.step(); p.cpu.step();
  assert.deepEqual([p.cpu.W(6), p.cpu.W(7), p.cpu.W(8), p.cpu.W(15)], [0x5678, 0x9abc, 0x1234, 0x0900]);
  p.cpu.step(); p.cpu.step();
  assert.equal(p.cpu.mem[0x801], 0x4242);
  p.cpu.step();
  assert.deepEqual([p.cpu.W(14), p.cpu.W(15), p.cpu.mem[0x480]], [0x0902, 0x0906, 0x0a00], 'LNK: W14 pushed, the frame of 4 bytes');
  p.cpu.step();
  assert.deepEqual([p.cpu.W(14), p.cpu.W(15)], [0x0a00, 0x0900], 'ULNK');
});

test('#5480 SE, ZE, SWAP, EXCH, DAW.B: their results and flags', () => {
  let { cpu } = exec('se w1, w2', { W1: 0x1280, SR: 0 });
  assert.deepEqual([cpu.W(2), cpu.sr & 0xf], [0xff80, 8], 'SE: N, C = !N');
  ({ cpu } = exec('se w1, w2', { W1: 0x1200, SR: 0 }));
  assert.deepEqual([cpu.W(2), cpu.sr & 0xf], [0, 3], 'SE of 0: Z and C');
  ({ cpu } = exec('ze [w1++], w2', { W1: 0x1001, 'Data 1000': 0x9f00, SR: 8 }));
  assert.deepEqual([cpu.W(2), cpu.W(1), cpu.sr & 0xf], [0x9f, 0x1002, 1], 'ZE: a byte operand (its pointer by 1), N clear, C set');
  assert.equal(exec('swap w1', { W1: 0x1234 }).cpu.W(1), 0x3412);
  assert.equal(exec('swap.b w1', { W1: 0x1234 }).cpu.W(1), 0x1243);
  ({ cpu } = exec('exch w1, w2', { W1: 1, W2: 2 }));
  assert.deepEqual([cpu.W(1), cpu.W(2)], [2, 1]);
  // DAW.B after a BCD addition: 0x19 + 0x28 = 0x41 with DC: 0x47; 0x99 + 0x01 = 0x9A: 0x00 and C
  assert.equal(exec('daw.b w0', { W0: 0x5541, SR: 0x100 }).cpu.W(0), 0x5547);
  ({ cpu } = exec('daw.b w0', { W0: 0x009a, SR: 0 }));
  assert.deepEqual([cpu.W(0), cpu.sr & 1], [0x0000, 1]);
});

test('#5480 the table reads and writes: TBLPAG:EA, the low word, the high byte (the phantom byte 0), the write latches', () => {
  const program = []; program[0x8000 >> 1] = 0x123456;
  let { cpu } = exec('tblrdl [w1], w2', { W1: 0x8000, TBLPAG: 0 }, { program });
  assert.equal(cpu.W(2), 0x3456);
  ({ cpu } = exec('tblrdh [w1], w2', { W1: 0x8000 }, { program }));
  assert.equal(cpu.W(2), 0x0012);
  ({ cpu } = exec('tblrdl.b [w1], w2', { W1: 0x8001, W2: 0xff00 }, { program }));
  assert.equal(cpu.W(2), 0xff34);
  ({ cpu } = exec('tblrdh.b [w1], w2', { W1: 0x8001, W2: 0xff00 }, { program }));
  assert.equal(cpu.W(2), 0xff00, 'TBLRDH.B at an odd address: the phantom byte, 0');
  // the configuration space: TBLPAG 0xFF, the device ID 0x601D at 0xFF0000
  ({ cpu } = exec('tblrdl [w1], w2', { W1: 0x0000, TBLPAG: 0xff }));
  assert.equal(cpu.W(2), 0x601d);
  // TBLWTL / TBLWTH to the latches, read back; the program memory itself unchanged (the NVM programs it)
  const t = cpuWith(['tblwtl w2, [w1]', 'tblwth w3, [w1]', 'tblrdl [w1], w4', 'tblrdh [w1], w5'], { program });
  for (const [k, v] of Object.entries({ W1: 0x8000, W2: 0xbeef, W3: 0x00a5, TBLPAG: 0 })) set(t.cpu, k, v);
  const cycles = [0, 1, 2, 3].map(() => t.cpu.step());
  assert.deepEqual(cycles, [2, 2, 2, 2]);
  assert.deepEqual([t.cpu.W(4), t.cpu.W(5), t.cpu.prog[0x4000]], [0xbeef, 0xa5, 0x123456]);
});

test('#5480 the EDS window: PSV reads of the program memory (DSRPAG 0x200-0x3FF), page 1 the RAM above 0x7FFF, page 0 an address error', () => {
  const program = []; program[0x18000 >> 1] = 0xab1234; program[(0x18002) >> 1] = 0xcd5678;
  // DSRPAG 0x203: program address 0x018000 at EA 0x8000 (its lower words); 0x303 its upper bytes
  let { cpu, cycles } = exec('mov [w1], w2', { W1: 0x8000, DSRPAG: 0x203 }, { program });
  assert.deepEqual([cpu.W(2), cycles], [0x1234, 2], 'a PSV MOV: one cycle more');
  ({ cpu, cycles } = exec('add w0, [w1], w2', { W0: 1, W1: 0x8002, DSRPAG: 0x203 }, { program }));
  assert.deepEqual([cpu.W(2), cycles], [0x5679, 3], 'a PSV operand of another instruction: two more');
  ({ cpu } = exec('mov [w1], w2', { W1: 0x8002, DSRPAG: 0x303 }, { program }));
  assert.equal(cpu.W(2), 0x00cd, 'DSRPAG[8]: the upper word, its phantom byte 0');
  ({ cpu } = exec('mov.b [w1], w2', { W1: 0x8001, DSRPAG: 0x203, W2: 0 }, { program }));
  assert.equal(cpu.W(2), 0x12);
  // page 1: the RAM at 0x8000-0x87FF, through either window
  ({ cpu, cycles } = exec('mov [w1], w2', { W1: 0x8010, DSRPAG: 1, 'Data 8010': 0x6666 }));
  assert.deepEqual([cpu.W(2), cycles], [0x6666, 2], 'an EDS read: one cycle more');
  ({ cpu } = exec('mov w2, [w1]', { W1: 0x8020, W2: 0x7777, DSWPAG: 1 }));
  assert.equal(cpu.mem[0x8020 >> 1], 0x7777);
  // page 0: the address error trap
  ({ cpu } = exec('mov [w1], w2', { W1: 0x8000, DSRPAG: 0 }, { eds0: true }));
  assert.equal(cpu.trapReq, 1 << 1);
  assert.match(cpu.log[0].text, /a read at 0x8000 in the EDS window with DSRPAG 0: address error trap/);
});

test('#5480 the RAW stalls (DS70000157 table 4-6): a W written then used as a pointer, one cycle; PUSH then POP', () => {
  const pairs = [
    [['add w0, w1, w2', 'mov [w2], w3'], 1], [['add w0, w1, w2', 'mov [w2++], w3'], 1],
    [['add w0, w1, [w2++]', 'mov [w2], w3'], 1], [['add w0, w1, [w2]', 'mov [w2], w3'], 0],
    [['add w0, w1, w2', 'mov w2, w3'], 0], [['mov [w2++], w4', 'mov [w2], w3'], 0],
    [['push w1', 'pop w4'], 1], [['mov w0, 0x0004', 'mov [w2], w3'], 1],
  ];
  for (const [lines, stall] of pairs) {
    const { cpu } = cpuWith(lines);
    for (const [k, v] of Object.entries({ W0: 0x1000, W1: 0, W2: 0x1000, W15: 0x0900 })) set(cpu, k, v);
    cpu.step();
    assert.equal(cpu.step(), 1 + stall, lines.join(' ; '));
  }
});

test('#5480 an address error: a word at an odd address, its write not done; the trap\'s vector and stack frame, INTCON1\'s ADDRERR', () => {
  const program = []; program[0x000006 >> 1] = 0x000400;   // the address error trap's vector: 0x400
  const { cpu } = cpuWith(['mov w2, [w1]', 'nop'], { program, org: 0x0200 });
  for (const [k, v] of Object.entries({ W1: 0x1001, W2: 0x1234, W15: 0x0900, SR: 0x0003 })) set(cpu, k, v);
  cpu.step();
  assert.deepEqual([cpu.mem[0x800], cpu.trapReq], [0, 2], 'the write inhibited, the trap requested');
  const c0 = cpu.cycles;
  cpu.step();   // the exception's entry
  assert.equal(cpu.pc, 0x400);
  assert.equal(cpu.cycles - c0, 4, 'its entry\'s cycles');
  assert.deepEqual([cpu.W(15), cpu.mem[0x480], cpu.mem[0x481]], [0x0904, 0x0202, 0x0300], 'PC<15:0>, then SRL (0x03), IPL3, PC<22:16>');
  assert.equal(get(cpu, 'INTCON1') & 8, 8);
  assert.equal(cpu.ipl, 13, 'the address error\'s priority');
  assert.equal(get(cpu, 'INTTREG'), (13 << 8) | 1);
  assert.match(cpu.log[0].text, /^PC 0x000200: a word write at the odd address 0x1001: address error trap$/);
});

test('#5480 a stack error: W15 past SPLIM (once written) or below the RAM', () => {
  let { cpu } = cpuWith(['push w0', 'push w0']);
  set(cpu, 'W15', 0x0a00);
  cpu.wr(0x20, 0x0a00, 0);   // SPLIM written as the program would
  cpu.step();
  assert.equal(cpu.trapReq, 0, 'a push at SPLIM itself is allowed');
  cpu.step();
  assert.equal(cpu.trapReq, 1 << 3);
  ({ cpu } = cpuWith(['pop w0']));
  set(cpu, 'W15', 0x0800);
  cpu.step();
  assert.equal(cpu.trapReq, 1 << 3, 'a pop below 0x0800');
  // no SPLIM written: no limit
  ({ cpu } = cpuWith(['push w0']));
  set(cpu, 'W15', 0x8000);
  cpu.step();
  assert.equal(cpu.trapReq, 0);
});

test('#5480 the resets: an illegal instruction (a dsPIC\'s MAC), an uninitialized W register as a pointer; both said, the PC 0', () => {
  let { cpu } = cpuWith(['.word 0xc30000', 'nop']);
  cpu.step();
  assert.deepEqual([cpu.pc, cpu.resetCause], [0, 'illegal instruction 0xC30000']);
  assert.match(cpu.log[0].text, /^PC 0x000200: illegal instruction 0xC30000: the device resets$/);
  ({ cpu } = cpuWith(['mov [w3], w4'], { uninit: true }));
  cpu.step();
  assert.deepEqual([cpu.pc, cpu.resetCause], [0, 'W3 used as an address pointer before it was written']);
  // a W written first is initialized; W15 always is
  ({ cpu } = cpuWith(['mov #0x1000, w3', 'mov [w3], w4', 'push w4'], { uninit: true }));
  cpu.step(); cpu.step(); cpu.step();
  assert.deepEqual([cpu.pc, cpu.log], [0x0206, []]);
});

test('#5480 the CPU registers: RA read-only, the IPL read-only under NSTDIS, IPL3 only cleared, W15 and SPLIM even, PCL / PCH the PC', () => {
  let { cpu } = exec('mov w0, 0x0042', { W0: 0x01ff });
  assert.equal(cpu.sr, 0x01ef, 'RA (0x10) not written');
  ({ cpu } = exec('mov w0, 0x0042', { W0: 0x00e0, INTCON1: 0x8000 }));
  assert.equal(cpu.sr & 0xe0, 0, 'NSTDIS: the IPL kept');
  ({ cpu } = exec('mov w0, 0x0044', { W0: 0x000c, CORCON: 0x0004 }));
  assert.equal(get(cpu, 'CORCON'), 0x0004, 'IPL3 cannot be set');
  ({ cpu } = exec('mov w0, 0x0044', { W0: 0x0000, CORCON: 0x000c }));
  assert.equal(get(cpu, 'CORCON'), 0x0000, 'IPL3 cleared');
  assert.equal(exec('mov #0x1235, w15').cpu.W(15), 0x1234);
  assert.equal(exec('mov w0, 0x0020', { W0: 0x1235 }).cpu.mem[0x10], 0x1234);
  assert.equal(exec('mov 0x002e, w1', {}, { org: 0x1234 }).cpu.W(1), 0x1234);
  assert.equal(exec('mov w0, 0x0032', { W0: 0xffff }).cpu.mem[0x19], 0x3ff, 'DSRPAG: 10 bits');
  assert.equal(exec('mov w0, 0x0034', { W0: 0xffff }).cpu.mem[0x1a], 0x1ff, 'DSWPAG: 9 bits');
});

test('#5480 the reset values, the SFR hooks (a peripheral\'s registers), the state saved and restored', () => {
  const cpu = new CPU([0x200050, 0x880000 | (0x2c4 >> 1) << 4, 0x800000 | (0x2c6 >> 1) << 4 | 1]);   // mov #5, w0; mov w0, 0x2c4; mov 0x2c6, w1
  assert.deepEqual([cpu.W(15), cpu.mem[0x22], cpu.mem[0x41], cpu.mem[0x54]], [0x0800, 0x0004, 0x8000, 0x4444], 'W15, CORCON, INTCON2 (GIE), IPC0');
  const writes = [];
  cpu.writeHooks[0x2c4] = (v, old, a, mask) => { writes.push([v, old, a, mask]); return true; };
  cpu.readHooks[0x2c6] = () => 0x0777;
  cpu.step();
  const saved = cpu.save();
  cpu.step(); cpu.step();
  assert.deepEqual(writes, [[5, 0, 0x2c4, 0xffff]]);
  assert.equal(cpu.mem[0x2c4 >> 1], 0, 'the hook took the write');
  assert.equal(cpu.W(1), 0x0777);
  cpu.restore(saved);
  assert.deepEqual([cpu.pc, cpu.cycles, cpu.W(0), cpu.W(1)], [2, 1, 5, 0]);
});
