In short:

- The assembler reads xc16-as's syntax and links a program as XC16 does: `assembleProgram(source)` gives its `.hex`.

In detail:

- **xc16-as's syntax and XC16's linker's places (#5931):** the directives `.include "p24FJ1024GB610.inc"`, `.text`,
  `.section`, `.bss` with `.space` / `.skip` (data labels from 0x0800), `.global`, `.equ` / `.set`, `.word` (16 bits:
  a wider value refused) and `.pword` (24), `.align`, `.end`, and `config __FWDT, FWDTEN_OFF` (the settings ANDed, a word
  set twice warned); expressions with C's operators and xc16-as's `tblpage()`, `tbloffset()`, `handle()` (`asm-expr.js`);
  the PIC24FJ1024GB610's registers, bits, vectors and configuration words by name (`gb610-names.js`: Silinx's own, from
  the emulator's register map; checked against XC16's by #5937). `assembleProgram(source, { file })`: a source with a
  `.global __reset` is linked as XC16's linker links it, its code from 0x200, the reset vector a GOTO __reset, each vector its
  `.global` handler's or `__DefaultInterrupt`'s (a RESET after the program when the source has none), its configuration
  words; a handler not `.global` warned (XC16 would leave its vector to the default); an older source as it is, from 0.
  `.word` in the emulator's tests' programs that held whole program words is `.pword`.
