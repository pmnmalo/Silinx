In short:

- New Project starts with the project's mode, three cards with a small drawing each: Circuit (gates, flip-flops,
  breadboards and drawings simulated with no board), Board (one board: its flow, its emulator, its programming) and
  System (several devices linked in a System document). Every existing project opens in its mode as it is.

In detail:

- **Project modes, phase 1 (#5754, roadmap #5753):** `core/project-mode.js`: the modes Circuit, Board and System, a layer
  over the profiles (#5440) with nothing new on disk: Circuit is the Digital Logic profile, Board the FPGA profile,
  System the Embedded / SoC and System profiles. A project's mode is read from its profile, itself read from its old kind:
  no migration, its silinx.json untouched. System stays off in a release (#5202).
- **New Project's first page:** Project Mode, three cards (Circuit, Board, System), each with its drawing; each makes the
  project kind its card made before (a design and simulation project, an FPGA project, a System project). The Embedded /
  SoC card goes: it is a System's profile, chosen in Design Properties. The summary says the mode. The cards' radio,
  drawing and words in a row (a dialog's label style no longer stacks them). Portuguese: Circuito, Placa, Sistema.
- **MCP:** `new_project` takes `mode` (circuit, board, system); `profile` is still accepted, refused when it is not of
  the mode, and `mode board` with a System top refused; `project_info` and `list_projects` say each project's `mode`.
