In short:

- Co-design: **Emulate** in the System editor opens the System Emulator: the System's boards side by side (the FPGA
  boards as the Board Emulator draws them, an Arduino Uno or Nano), run together in real time, their switches and
  buttons clicked, their LEDs and displays lit, the Arduino's pins and LED L, a terminal per serial terminal.

In detail:

- The System Emulator's view (web/js/system-emu-view.js, a document of its own, `sysemu:<file>`, from the System
  editor's Emulate or the System row's Emulate System): an FPGA board mounted with the Board Emulator's parts
  (`mountBoardParts`, its buttons held until the design saw a press), an Arduino drawn by web/js/emulator-arduino.js,
  the terminals in its side panel, its run paced to real time, its status line the time and the rate. The MCP server's
  `simulate` of a System takes `controls` (a board's switches and buttons set at their times) and says what each board
  shows at the end. Off in a release, as the rest of co-design (#5212).
