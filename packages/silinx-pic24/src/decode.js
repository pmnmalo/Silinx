// silinx-pic24 - the opcode map (#5480): the handler of each instruction word's top byte, from the exec-*.js modules;
// a top byte with no PIC24F instruction (the dsPIC's DSP and DO, the PIC24E's) is an illegal instruction, which
// resets the device. The bit, shift, multiply and divide, and program flow instructions come next (#5480's next part).

import { aluOps } from './exec-alu.js';
import { moveOps } from './exec-move.js';

const illegal = (cpu, op) => cpu.illegal(op);
const nop = () => {};

export const OPS = new Array(256).fill(illegal);
OPS[0x00] = nop;
OPS[0xff] = nop;   // NOPR (and the erased flash's 0xFFFFFF)
for (const add of [aluOps, moveOps]) add(OPS);

/** Whether a top byte has PIC24F instructions. */
export const implemented = (top) => OPS[top] !== illegal;
