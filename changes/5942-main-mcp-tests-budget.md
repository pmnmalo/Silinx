In detail:

- **Main's MCP tests and tools/list budget (#5942):** the ECP5's, GateMate's, Gowin's, Intel's and 7-series' MCP tests no
  longer make a constraints file with `new_source` (refused since #5873): they check the refusal and their family's
  template through `core/new-source-text.js`, the Constraints Wizard's checks as they were. The descriptions of
  `project_info`, `constraints_wizard`, `write_file`, `simulate_drawing`, `related_view`, `verify` and `run_process`
  shortened, saying the same: `tools/list` 139,143 characters, under its 139,264 budget again (#4752).
