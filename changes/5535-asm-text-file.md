In short:

- A microcontroller's assembly program (`.asm`, `.s`) is shown to whoever follows a shared project, and is imported as
  a text file.

In detail:

- **Assembly is a text file of the import gate (#5535):** `core/import-gate.js` had no kind for `.asm` and `.s`, so it
  kept them opaque, as bytes with no text. A follower of a shared project (the interface's, and the MCP's
  `follow_project`) saw an AVR program, such as the co-design examples' `uno/hello.asm`, with no text, while the `.hex`
  beside it showed. They are now a text kind of their own, `asm`, checked as a source: a NUL byte, a web page or a line
  over the limit is refused, and invalid UTF-8 is replaced with a warning. An ASM chart (`.asm.json`) is a drawing, as
  before.
