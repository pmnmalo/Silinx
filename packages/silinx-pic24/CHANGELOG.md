# Changelog

What changed in each version of silinx-pic24, the Silinx PIC24 emulator. The newest version is first. Its versions
are its own (semver, 0.x until its API is stable), apart from Silinx's. What changed since the last release is in
[changes/](changes/).

## 0.1.0

In short:

- **A PIC24F core emulator:** silinx-pic24, the PIC24FJ1024GB610's core in JavaScript, with no dependency: its
  arithmetic, logic and data movement instructions, its addressing modes, its data bus with the SFRs' hooks.
- **The PIC24 emulator loads XC16's .hex and runs as a System's node:** its interrupts and traps, its configuration
  words (the oscillator and so its instruction clock), its time in ps, `run(t1, inputEvents)`.
- **On npm:** silinx-pic24 is published on npm (`npm install silinx-pic24`), with npm's provenance.

In detail:

- **Published on npm (#5509):** from the package's own tag, `silinx-pic24-vX`, once Silinx's CI has passed on the
  tagged commit (`.github/workflows/silinx-pic24-release.yml`), with npm's provenance; the package holds `src/`,
  `LICENSE` and `README.md`.
- **The bit, shift, multiply, divide and program flow instructions (#5480):** BSET, BCLR, BTG, BTST, BTSTS, BSW, BTSC,
  BTSS on Ws and on f; FBCL, FF1L, FF1R; SL, LSR, ASR, RLC, RLNC, RRC, RRNC on Ws and on f, and SL, LSR, ASR by Wns or
  #lit4; MUL.UU, MUL.US, MUL.SU, MUL.SS and MUL f; the iterative DIV.S, DIV.U, DIV.SD, DIV.UD (REPEAT #17's target: the
  dividend copied at the first iteration, the quotient and remainder at the last; a divide by zero the math error trap;
  other than 18 executions said); BRA on its 15 conditions and by Wn, CALL, RCALL, GOTO by address and by Wn, RETURN,
  RETLW, RETFIE; CPSEQ, CPSNE, CPSGT, CPSLT; REPEAT #lit14 and Wn; DISI; PWRSAV (sleep and idle until an interrupt);
  RESET, CLRWDT, BOOTSWP (not emulated: said), PUSH.S and POP.S, NOPR. Their cycles: 2 for a change of the PC, 3 for
  a return (2 with an exception pending), a skip's 2 or 3. Tests: every condition of BRA against its definition over
  N, OV, Z, C; the products and quotients against the integers'; the manual's worked examples, all 228 run; a loop's
  cycles by hand.
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
- **The interrupt controller, the HEX, the node (#5480):** the interrupts tested (their priorities against the IPL,
  the natural order, nesting and NSTDIS, DISI, the traps above them and in their order, the stack frame and RETFIE, a
  REPEAT interrupted and resumed, a sleep woken); XC16's Intel HEX read and written (`parseHex`, `writeHex`: four
  bytes a program word, its phantom byte, the extended linear addresses, the configuration space, the checksums);
  the configuration words read (`readConfig`: FNOSC and PLLMODE, Fcy = Fosc / 2, the Explorer 16/32's 8 MHz crystal as
  the primary oscillator, FWDTEN's watchdog said); `Pic24Node`, the scheduler's `run(t1, inputEvents)` with its time in
  ps, its pins' hooks for the peripherals (#5481: `onInput`, `drive`), its log, its state saved and restored. Tests:
  HEX records by hand, its errors, the configurations, the node's times; small programs from reset (a multiply and
  divide routine with its cycles counted by hand, an interrupt-driven counter, a PSV and TBLRDL table sum).
