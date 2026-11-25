In short:

- **A System's Simulate:** the Simulate task of a System project shows the System and its nodes as a tree. **Simulate
  System** runs the nodes you tick, and **Simulate Node** runs one node alone. Each opens in a document of its own and
  runs for the run's time. **Simulation Properties…** chooses the nodes, the run's time and a stimulus file, which makes
  a run repeatable: its switches, buttons and sensors, and the text typed, each at its time.

In detail:

- **The Simulate task of a System project (#5581, part 3 of 4):** its panel shows the System's tree in place of the test
  benches (`web/js/system-simulate-ui.js`, drawn by `web/js/processes.js`, `web/js/tasks-sim-panel.js`).
  - The System's row has Simulation Properties… and Simulate System.
  - Each node's row has its simulation's runs: an FPGA node's test benches (its folder's `sim/`) and Simulate Node.
  - The task's page says so.
  - The ISE style's Processes panel has the same on the System's and the nodes' rows.
- **Simulate System and Simulate Node** (`web/js/system-sim-open.js`):
  - They open the System's simulation view in a document of its own in the Simulate task, `syssim:<file>`. Its tab says
    which, and its status line has its time.
  - The System is cut to the nodes that run, as Emulate's is, each open end said.
  - The run goes on for the run's time. The view's `Run 100 ms` becomes the run's time.
- **The Simulation Properties** are the project's, in `silinx.json`'s `system.simulate` (`core/system-alone.js`): the
  nodes, the run's time (100 ms by default) and the stimulus file. Their dialog can make a new stimulus file and open it.
- **The stimulus file** (`<name>.stim.json`, `core/system-stimulus.js`):
  - its controls, the MCP simulate's (#5602's `core/system-controls.js`);
  - the text typed into its terminals, at their times;
  - each set as the run reaches it, in the worker's host too (`core/system-host.js`).
  - A step that cannot be is refused, and the run says which.
- **MCP (#2674):**
  - `simulate` of a System with no `controls` runs its Simulation Properties: its nodes (unless `#a,b`), its time (unless
    `time_ns`) and its stimulus file.
  - `set_process_properties` takes `simulation: { nodes, ms, stimulus }`.
  - Some tools' descriptions are shorter, for tools/list's budget (#5520).
