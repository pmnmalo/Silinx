In short:

- A PIC24F assembler: `assemble(source, { file })` gives a program's words, its labels, and its errors by file and line.

In detail:

- **The assembler is the package's (#5930):** the emulator's tests' PIC24F assembler (the instruction set's every form,
  its encodings checked against DS70000157) moved into `src/asm.js` as it was, and exported: `pic24Assemble` (its first
  error thrown, `line N: …`) and `assemble`, which reports every line's error as `{ file, line, message }` (written
  `file:line: message` by `asmMessage`) and assembles the lines after one that failed. A label defined twice is now
  an error naming both lines (it used to keep its last place silently, so a `bra` could jump into another routine:
  #5893). Tests: pic24-asm (the package's export, a label defined twice, the errors by line, a branch out of reach,
  no warnings).
