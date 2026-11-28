In detail:

- **The uart-pic24 example's PIC24 program in xc16-as's syntax (#5931):** `pic/lcd_uart.asm` names the registers
  (`TRISA`, `U2STA`, `RPINR19`…) and sets its watchdog with `config __FWDT, FWDTEN_OFF`; its `.hex` is built from it by
  silinx-pic24's assembler as XC16's linker would place it (the same program words, the vector table now filled with the
  default handler). Tests: system-example (its `.hex` the assembler's, no error or warning), xc16-compile-server and the UI
  test system-firmware-pic24 (its words).
