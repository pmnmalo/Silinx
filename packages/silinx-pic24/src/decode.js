// silinx-pic24 - the opcode map (#5480): the handler of each instruction word's top byte, from the exec-*.js modules;
// a top byte with no PIC24F instruction (the dsPIC's DSP and DO, the PIC24E's) is an illegal instruction, which
// resets the device.

import { aluOps } from './exec-alu.js';
import { moveOps } from './exec-move.js';
import { bitOps } from './exec-bit.js';
import { shiftOps } from './exec-shift.js';
import { mulDivOps } from './exec-muldiv.js';
import { flowOps } from './exec-flow.js';

const illegal = (cpu, op) => cpu.illegal(op);

export const OPS = new Array(256).fill(illegal);
for (const add of [aluOps, moveOps, bitOps, shiftOps, mulDivOps, flowOps]) add(OPS);

/** Whether a top byte has PIC24F instructions. */
export const implemented = (top) => OPS[top] !== illegal;
