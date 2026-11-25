In short:

- A microcontroller's MicroPython program (`.py`) is shown to whoever follows a shared project, and is imported as a
  text file.

In detail:

- **MicroPython is a text file of the import gate (#5551):** `core/import-gate.js` had no kind for `.py`, so it kept
  it opaque, as bytes with no text: a follower of a shared project (the interface's, and the MCP's `follow_project`)
  saw a MicroPython node's program, such as an ESP32's `main.py`, with no text. It is now a text kind of its own,
  `python`, checked as a source, as assembly is since #5535: a NUL byte, a web page or a line over the limit is
  refused, and invalid UTF-8 is replaced with a warning. Silinx still never runs an imported file.
