In short:

- **A PIC24F core emulator:** silinx-pic24, the PIC24FJ1024GB610's core in JavaScript, with no dependency: its
  arithmetic, logic and data movement instructions, its addressing modes, its data bus with the SFRs' hooks.

In detail:

- **The package and its core (#5480):** `packages/silinx-pic24`, MIT, a workspace of its own (its changelog, its
  versions), importing nothing of Silinx. The CPU (`cpu.js`, avr8js's shape: `new CPU(program)`, `step()`, `run(cycles)`,
  `cycles`, `readHooks` / `writeHooks`, `addClockEvent`, `save()` / `restore()`): W0–W15, SR and CORCON with their
  read-only bits, SPLIM, the data memory (the SFRs, 32 KB of RAM, the EDS window: page 1 the RAM above 0x7FFF, 0x200–0x3FF
  the program memory's words read through PSV, an external memory's hooks), the RAW stalls (DS70000157 table 4-6), the
  address and stack error traps and their entry (the vector, the stack frame, the IPL, INTTREG), the resets of an
  illegal instruction and of an uninitialized W register as a pointer. The instructions: ADD, ADDC, SUB, SUBB, SUBR,
  SUBBR, AND, IOR, XOR, INC, INC2, DEC, DEC2, NEG, COM, CLR, SETM, CP, CPB, CP0 in their forms, MOV in its forms, MOV.D,
  PUSH and POP, LNK, ULNK, SE, ZE, SWAP, EXCH, DAW.B, the table reads and writes (to the write latches).
- **Its tests (#5480):** a test-side PIC24 assembler (`test/pic24-asm.mjs`), each instruction form's encoding checked
  against DS70000157's; the manual's worked examples (`test/fixtures/pic24-manual-examples.json`), the ones its
  instructions cover run and compared (its errata, each checked by hand, with their reasons); the flags against an
  independent reference in both modes; the addressing modes, the cycles, PSV and EDS, the traps and the resets.
