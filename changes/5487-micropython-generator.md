In short:

- **Drawings in MicroPython:** a state diagram, an ASM chart, a Petri net or a truth table in a microcontroller node
  whose language is MicroPython generates its MicroPython program, `<node>/<module>.py`, with the same ticks as the
  Arduino's C; its row on the Design pane has a `[Py]` badge that opens it.

In detail:

- **The synchronous reactive model's MicroPython generator (#5487):** `core/reactive-py.js` writes a drawing's model as
  a MicroPython program, its HAL `machine.Pin` and `time.ticks_ms`, the same `.py` on the ESP32 and on the Pico:
  `step_machine()` one tick every `TICK_MS` milliseconds of `main()`'s loop (the inputs read once at its start, the
  outputs' defaults, an `if` / `elif` on the state, the outputs written at its end), named states and pins, a variable
  read after it is set kept apart (`<name>_next`). `core/reactive-py-expr.js` writes the expressions with the masks
  Python's unbounded integers need, a shift left by a variable 0 from the width on, `and` and `or` giving 0 or 1;
  `core/reactive-py-pins.js` gives the ports the ESP32 DevKit's or the Pico's GPIOs (the user's, checked: the ESP32's
  flash pins refused, its inputs-only pins not outputs, its serial port's warned about; the others the next free ones).
  A port named as a word of Python, a builtin or a name of the program's is renamed with a warning.
- **A drawing in a MicroPython node gets its program (#5487):** `core/drawing-code.js` and `core/drawing-sync.js` make
  it next to the drawing, `<module>.py`, as a C node's `.ino`: when it is written (the MCP's `write_file`, the editors),
  again when it changes, stale with errors, when the project is opened; a node whose language changes from C to
  MicroPython, or back, gets its drawings' other file, the old one removed. Its ports are at 3.3 V. Until the ESP32's and
  the Pico's nodes (#5495, #5494), a MicroPython node is on an Arduino's board, which does not run MicroPython: the
  program is the ESP32 DevKit's, on its free pins, with a warning. It replaces "not made yet".
- **Tests (#5487):** each of the examples' drawings and the edge cases generated, compiled (`py_compile`) and run on the
  computer's Python with a mock of `machine` and `time` (`test/fixtures/micropython-mock/run.py`), tick by tick against
  the model, on the ESP32 and on the Pico; golden files (`test/fixtures/reactive-py/`); the pins, the names, the
  errors and the warnings; the MCP's `write_file` in a MicroPython node; the Design pane's `[Py]` (both interfaces,
  Portuguese).
