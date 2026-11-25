In short:

- **Compile Firmware:** an Arduino node of a System compiles its sketch on the local server with arduino-cli, written
  by hand or drawn. The errors and warnings go to the console by file and line, and the `.hex` goes to the node's
  folder, where Emulate System runs it.

In detail:

- **An Arduino node's firmware compiled on the local server (#5503):** an Arduino Uno's or Nano's row in the Design pane
  has Compile Firmware (`web/js/system-firmware-ui.js`, `web/js/system-processes.js`). The local server's arduino-cli
  (`server/avr-compile.js`, POST `/projects/:p/firmware`) compiles the node's folder's `.ino`, C and C++ files
  (`core/avr-compile.js`), hand-written or a drawing's generated sketch (#5486). It builds them in
  `build/nodes/<id>/firmware/` for the board's FQBN. gcc's errors and warnings become ERROR / WARNING lines by the
  project's file, line and column; the Errors and Warnings tabs' rows open the `.ino` there (`core/message-location.js`,
  `web/js/console.js`).
  The `.hex` is written over the node's firmware, or to `<id>/<sketch>.hex`, which becomes the node's firmware.
  arduino-cli and its Arduino AVR core are the user's to install: they are found on the PATH, in Homebrew's folder or
  at config.json's `paths["arduino-cli"]`. Without them, and in the browser edition, Compile Firmware says what is
  missing. It runs on a trusted project only, as ISE does. The PIC24's firmware and a MicroPython node's program are not compiled.
  MCP (#2674): `run_process` process `firmware` with the node's id (`*`: every Arduino node), the same messages and
  locations. `toolchain_info` gives arduino-cli's version and its core's. Portuguese (`web/js/i18n-system.js`).
  docs/SYSTEMS.md: compiling an Arduino node's firmware. Tests: avr-compile (the nodes, the sketch, gcc's messages),
  avr-compile-server (a stand-in for arduino-cli, `test/fixtures/arduino-cli-stub`: the exact lines, the refusals,
  `run_process`, `toolchain_info`; with the real arduino-cli, when installed, a sketch and #5486's generated
  `traffic.ino` compiled with no warning), ui/system-firmware (both interfaces, Portuguese, the browser edition).
