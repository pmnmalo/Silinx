In short:

- A Board project can be a processor board alone: New Project's Board card asks the Board Type, FPGA, Arduino (Uno,
  Nano), PIC24 (Explorer 16/32), Raspberry Pi Pico (Pico, Pico W) or ESP32 (DevKitC), and the settings page lists that
  type's boards. The project starts with a
  firmware that blinks the board's LED (the PIC24's: none yet, its .hex is MPLAB X's), and the board's row offers its
  emulation, its simulation and its programming.

In detail:

- **Processor boards, phase 3 (#5756, roadmap #5753):** `core/processor-board.js`: a Board project for a processor board
  is a System of its one microcontroller node (its System document and starter firmware written), with the board named
  in silinx.json's `board`, which no other System project has: its mode is Board (`core/project-mode.js`), and it runs on
  the System's machinery (Compile Firmware, Emulate Node, Simulate Node, Program Node, the MCP's simulate). The starters:
  an AVR blink (`blink.asm` and its `.hex`, checked on the AVR emulator: D13 toggled every ~4 million cycles), a MicroPython
  or CircuitPython blink for the Pico, a MicroPython one for the Pico W and the ESP32.
- **New Project** (`web/js/project-kind-step.js`, `web/js/processor-new.js`): the Board card's Board Type (its processors'
  where Systems are on, #5202), the settings page's board list that type's boards (a processor's: no example); one
  chosen, the FPGA's fields hidden, a Pico's Python firmware to choose; its summary; Finish opens the
  starter firmware. The Design pane's top row is the board's node (no System row); the console says the board opened.
- **Mode changes:** a processor board's project goes up to System (its board's name dropped, nothing moved); a System goes
  down to one of its microcontrollers (`keep`), its System rewritten with that node alone; Circuit is refused both ways
  (a firmware is no drawing).
- **MCP:** `new_project` with a processor board (and `runtime` for a Pico); `list_devices` lists the processor boards, each
  with its type.
- **Check System:** a System of one node no longer warns that it joins nothing.
