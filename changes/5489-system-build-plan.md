In short:

- **Build Plan and Build All:** a System's row in the Design pane says each node's plan in the console (how it is built,
  what it programs, and whether it is up to date) and builds every node that is not, the FPGA nodes first, then the
  Arduinos.

In detail:

- **A System's build plan and Build All (part 1 of #5489):** `core/system-plan.js` gives each FPGA and microcontroller
  node's steps in order, the FPGA nodes first: its build (the Silinx toolchain to `build/nodes/<id>/build/<module>.bit`,
  arduino-cli to its sketch's `.hex`), its image, its programmer, and its state: up to date, out of date (a source
  changed, new or removed, or its board, variant, module, pins, firmware or language; not its place on the canvas), not
  built, given (a `.hex` with no sketch), nothing to build (a MicroPython program), or not buildable, said why (a PIC24's
  C: XC16 is #5482). A node's build records what it was built from, `built-from.json` (its description and its
  sources' hashes, taken when it starts), however it was started: Generate Programming File, Compile Firmware or Build
  All (`server/system-plan.js`, `server/system-implement.js`, `server/avr-compile.js`). The System row's **Build Plan**
  says the plan, one line a node, and **Build All** builds the nodes not up to date in that order, each said, the up to
  date left as they were (`web/js/system-build-ui.js`, `server/system-build-all.js`, GET `/projects/:p/build-plan`, POST
  `/projects/:p/build`); one build of a project at a time. The browser edition says a System is built by the local
  server. MCP (#2674): `run_process` process `build` (a node's id, built whatever its state, or `*`), `check_system`'s
  `plan` and its lines; no new tool (#5520: `run_process`'s, `share_project`'s and `program_prom`'s descriptions
  shortened to make room). Portuguese (`web/js/i18n-system.js`). docs/SYSTEMS.md: the build plan. Tests: system-plan
  (every kind of node and state, the order, the lines), system-build-all (the uart-avr example built, built again, a
  sketch and the pins changed; the refusals; an untrusted project; the MCP), ui/system-build-all (both interfaces,
  Portuguese, the browser edition); ui/design-system-nodes's Arduino node's processes (Compile Firmware, #5503).
