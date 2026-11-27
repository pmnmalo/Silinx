In short:

- **Emulate's side panel** shows the project, its device and its top module (no source-type badge), with the
  emulation's processes under it: I/O Pin Planning, and **Emulate** (renamed from "Emulate on Board") with its models.

In detail:

- **Emulate's hierarchy (#5789):** the Tasks interface's Emulate side panel draws its processes under the design's
  hierarchy, as the Design pane shows it: the project, its device and its top module, with the Design pane's icons and
  no badge ([VHDL], [Verilog], [SCH]…); their names are not translated, and a double-click on them runs nothing
  (web/js/processes.js emulateProcesses). "Emulate on Board" is now "Emulate" everywhere: the processes of both
  interfaces (the ISE style's Processes pane too), Emulate's bar, the Portuguese translation (Emular), the user
  guide's Board Emulator page. A System project's Emulate tree stays as it was.
