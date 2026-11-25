In short:

- The Design pane of a System project groups its rows by node, and New Source puts a new source in the selected
  node's folder, in its language.

In detail:

- **The Design pane grouped by node (#5488, roadmap #5479's phase 2):** under a System project's System row, one
  branch per node holds the rows of its folder: an FPGA node's module and its hierarchy, then its folder's other root
  modules, drawings and packages; a microcontroller's drawings (a state diagram's row as an FPGA node's, its last badge the node's
  base language, `[C]`, no schematic of it: its code is #5486's), its firmware, then its folder's sources (its `.asm`);
  a circuit's drawing. The rows of no node's folder are under the System itself, a node's own module or circuit shown under its
  node only. New Source puts a source in the selected node's folder (a node's row, or a row of a file in its folder),
  else the first FPGA node's, a test bench in its `sim` sub-folder, its language the node's base language; the MCP's
  `new_source` the same (its location a node's folder, or none: the first FPGA node's). `core/system-layout.js`
  sourcePlace is both's. The MCP's `project_info` gives a System's node its folder and the files in it (`folder`,
  `inFolder`; its nodes' line their count).
- **A System project's node folders kept as it leaves the workspace and comes back (#5488):** a zip exported and
  imported, a git clone (a drawing of a node's folder committed and diffed by its objects), a project shared live and
  followed: each node's files in the same folder, its System the same, checked as before (a test of each,
  `test/system-folders-roundtrip.test.js`).
