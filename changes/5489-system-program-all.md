In short:

- **Program All and Program Node:** a System's nodes are programmed on their boards from the Design pane, the FPGAs
  first over JTAG, then the Arduinos by arduino-cli; each node on the board its USB id matches, or one you pick.

In detail:

- **A System's nodes programmed on their boards (part 3 of #5489, Fixes #5447):** `core/system-program.js` gives each
  node's step over the build plan and the boards matched by their USB id, in the plan's order: an FPGA node's
  bitstream over JTAG by its board's programmer (`server/programmer.js` programJob), its board picked by its serial
  number where the tool can (djtgcfg's `-d SN:<serial>`, openFPGALoader's new `--ftdi-serial`); an Arduino's `.hex` by
  `arduino-cli upload --verify` on its board's serial port (`server/system-program.js`, GET
  `/projects/:p/program-plan`, POST `/projects/:p/program-system`). The System row's **Program All** and an FPGA or
  Arduino node's **Program Node** (`web/js/system-program-ui.js`): a node whose board is missing or not told apart asks
  which connected board it is (Choose the Board, the user's pick an override of the match, Pedro's decision; Skip: not
  programmed). Refused and said: a node not built, a PIC24 (MPLAB IPE), a MicroPython node (mpremote), an untrusted
  project; warned: a node out of date, a board picked by hand. One line a node in the console and a summary; a node
  that fails, the next goes on. The browser edition says the local server programs a System's boards. MCP (#2674):
  `program_board` with `node` (`*` all) and `connected`, in place of a `program_node` tool (#5520: `program_board`'s,
  `share_project`'s and `simulate_drawing`'s descriptions shortened). Portuguese (`web/js/i18n-system.js`).
  docs/SYSTEMS.md. Tests: system-program (the steps, their refusals, warnings and lines, the board by hand, the tools'
  options), system-program-server (the programmers faked, arduino-cli's upload stubbed: Program All, two Unos, a board by
  hand, a programmer failing, the refusals, the MCP), ui/system-program (both interfaces, Portuguese, the browser
  edition); the System UI tests' process lists.
