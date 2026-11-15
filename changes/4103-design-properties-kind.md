In short:

- **Design Properties: Project Kind.** Design Properties asks the project's kind as New Project does, FPGA design or
  design and simulation only (no FPGA), and its board list no longer has a "no FPGA" entry.

In detail:

- **Design Properties' Project Kind (#4103):** the dialog has New Project's Project Kind field (web/js/wizards.js, the
  choices of web/js/project-kind-ui.js `KIND_OPTIONS`), the project's kind shown; "no FPGA" hides the board, the
  device, the synthesis tool and the language at once, FPGA design shows them; the conversions are #3780's, both ways,
  with their messages, and Undo Design Properties gives the kind back. The board list's "Design and simulation only
  (no FPGA)" entry is gone. The MCP server's `new_project` and `set_design_properties` take `kind` (`fpga`, `design`):
  `kind: fpga` alone makes a design project an FPGA project with no board (its default device), as the dialog's FPGA
  design with None Specified; `design_only` stays as its deprecated alias (`false` now that same conversion).
