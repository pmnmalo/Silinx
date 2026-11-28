In short:

- A drawing's program on a PIC24 node, compiled by XC16, runs on the emulator as its model does.

In detail:

- **The PIC24 emulator's bit instructions on a register as XC16 encodes them (#6017):** BSET, BCLR, BTG, BTST,
  BTSTS, BTSS and BTSC on f took their bit's encoding's last bit as bit 0, where it is bit 3 (a byte's address's
  last bit): XC16's `btst.b IFS0, #3` tested bit 6, and the drawings' programs (#5552) never ticked. The emulator and
  its assembler fixed (silinx-pic24), the uart-fpga-pic24 example's `.hex` assembled again; a test runs XC16 2.10's words.
