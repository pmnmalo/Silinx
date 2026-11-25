In short:

- **Several drawings in one Arduino node, run on the Arduino:** in a System, each state diagram, ASM chart, Petri net
  or truth table of an Arduino node is now its own C file, `<module>.c`, and the node has one sketch, `<node>/<node>.ino`,
  that runs them all. Compile Firmware builds them together, and the program does on the Arduino, tick by tick, what
  the drawings do.

In detail:

- **A drawing's C a unit of its node's program (#5486):** `core/reactive-c.js` `generateUnit` makes a drawing's C as
  its own file, `<module>.c` (`.cpp` in a C++ node). Every name in it is `static` but `<module>_init()` (the pins'
  modes, the reset state) and `<module>_tick()` (one tick). Its state type is its own (`<module>_State`: C++'s one
  definition rule, which the AVR's link-time optimisation checks) and its A pins are their numbers (in C an initializer
  is a constant, and the Arduino core's `A0` is a variable). The sketch of a drawing alone, `generateArduino`, is as
  before.
- **The node's sketch (#5486):** `core/reactive-c-main.js` `nodeMain` makes the node's one sketch, `<id>/<id>.ino`.
  arduino-cli joins a folder's `.ino` files into one, so two drawings' `setup()` and `loop()` did not link. The sketch
  calls each drawing's init in `setup()` and each one's tick every `TICK_MS` in `loop()`, the C ones declared
  `extern "C"`. A pin one drawing writes and another one uses is warned about, one warning for the pins of the same two
  ports.
- **The sketch kept in step (#5486):** `core/node-main-sync.js` `syncNodeMain` makes the sketch again from the node's
  drawings whenever a drawing's C is made or made again (`core/drawing-sync.js`, so the interface and the MCP's tools
  both do it). Compile Firmware (`server/avr-compile.js`) does it too before it compiles, so a drawing deleted since is
  no longer called. The sketch is removed when no drawing has its C, or when the node is no longer of C. A hand-written
  `.ino` in the node's folder is the node's program instead. A drawing whose own sketch (`<module>.ino`, the first form)
  was made before gets its unit, the old file removed.
- **Run on the Arduino (#5486):** `test/reactive-avr.test.js` compiles the examples' drawings and the edge cases with
  arduino-cli for the Uno, as C and as C++, with no compiler warning. It runs the `.hex` on avr8js tick by tick against
  the model, and a node's sketch of two drawings timed by `millis()`; it is skipped, with the reason, without
  arduino-cli. Tests: reactive-c-main (the unit, the node's sketch's exact text and its warnings, the sketch kept on a
  store), drawing-code, mcp-cpu-drawing (write_file's exact messages, the node's sketch, the pins' warnings, C, C++ and
  MicroPython), avr-compile-server (the real arduino-cli on a drawing's unit and the node's sketch), the UI's
  design-cpu-code (the node's sketch a row of its node, `[C]` opening `<module>.c`; both interfaces). docs/SYSTEMS.md.
