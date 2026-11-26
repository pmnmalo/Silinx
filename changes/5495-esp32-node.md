In short:

- **An ESP32 in a System:** the System editor's ESP32 tool places an ESP32 DevKitC, its program a `.py` run by MicroPython
  in WebAssembly with Silinx's `machine` (Pin, UART) and `time`, behavioural (each line 1 µs), in lockstep with the other
  nodes in Try it and Emulate; what it prints is its terminal.

In detail:

- **The ESP32 node, its Worker + Atomics back end (#5495):** `core/system-sim-esp32.js` (the node: its pins, its UARTs'
  frames, its console, its REPL once the program ended), `core/esp32-engine.js` (MicroPython's WebAssembly port, its
  settrace build, with `core/esp32-python.js`'s modules, in a Worker of its own) and `core/esp32-link.js` (their
  SharedArrayBuffer: the node blocks until the engine reached the scheduler's time, the engine between windows):
  deterministic, its time the program's lines and sleeps. Its Workers made before the run (`prepareEsp32`), in a page
  cross-origin isolated (#5648) or in Node (`server/esp32-spawn.js`), ended with the run. The board `esp32-devkitc`, its
  check (MicroPython only), the editor's tool, the plan, the MCP's `edit_system`, `check_system` and `simulate`. The JSPI
  back end follows.
