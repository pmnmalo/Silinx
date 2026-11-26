In short:

- The user's guide has a page on the project modes, Circuit, Board and System (`docs/user/en/modes.md`,
  in Portuguese too), and Getting started, the README and the MCP page now speak of modes.
- The examples are grouped by mode: a Circuit project can start from the gates or the breadboard example (made with no
  board), a Board project from the FPGA examples, a System project from the System ones.

In detail:

- **Examples by mode (#5757, roadmap #5753):** `core/examples.js` `CIRCUIT_EXAMPLES` (gates, breadboard: drawings and
  circuits only) and `exampleModes`; New Project's Start from offers each mode its examples; a Circuit example is made
  a design project, no board, its constraints file left out of the copy, the same in the local server and the browser
  edition (`core/project-kind.js` `circuitExample`). The MCP: `list_examples` gives each example's `modes`,
  `new_project_from_example` takes `mode` (circuit for a Circuit example).
- **Docs:** `docs/user/en/modes.md` and `docs/user/pt/modes.md` (what each mode is for and shows, starting a project,
  changing the mode, the projects of before, the MCP), linked from the guide's index; Getting started's New Project
  step, the READMEs, the MCP page and `docs/PROJECT.md` (the mode, a processor board's project) brought up to date.
- The MCP tools' descriptions made shorter, within the tools' list's budget (#4752).
