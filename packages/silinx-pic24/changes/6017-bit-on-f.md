In short:

- BSET, BCLR, BTG, BTST, BTSTS, BTSS and BTSC on a file register test and change the bit XC16 means: a C program's
  waits on a flag and its port bits work.

In detail:

- **A bit instruction on f, its bit as XC16 encodes it (#6017):** in `bbbf ffff ffff fffb` the last `b` is bit4<3> (and
  a byte's address's LSB), the first three bit4<2:0>; the emulator (`exec-bit.js`) and the assembler (`asm.js`) took
  the last `b` as bit4<0>, so XC16's `btst.b IFS0, #3` tested bit 6 and a drawing's program never saw Timer1's tick.
  The assembler's tests and the uart-fpga-pic24 example's `.hex` follow; a test runs XC16 2.10's own words.
