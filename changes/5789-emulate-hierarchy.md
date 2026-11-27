In short:

- **Implement, Emulate and Simulate** show the same hierarchy in their side panel: the project, its device (none in a
  Circuit project), then the top module (no source-type badge) with the task's processes under it, or, in Simulate,
  each test bench with its objects (the unit under test, its submodules) under it. "Emulate on Board" is now
  **Emulate**.

In detail:

- **The tasks' hierarchy (#5789):** web/js/task-hierarchy.js, one layout for the Tasks interface's Implement, Emulate
  and Simulate side panels, as the Design pane shows the design: the project, its device (none in a Circuit project,
  whose drawings are simulated with no board), then Implement's and Emulate's top module, with the Design pane's icons
  and no badge ([VHDL], [Verilog], [SCH]…), its processes under it (web/js/processes.js); Simulate's test benches, each
  with its objects under it, folded by its twisty, a click on it simulating it as before (web/js/tasks-sim-panel.js);
  with no test bench, the module and model prompts under the device, the page beside saying what to do. Their names
  are not translated, a double-click on them runs nothing, and they have no process's menu. The ISE style interface
  keeps ISE's own panes: its Design pane shows the project, the device and the top above its Processes pane, as ISE's
  does, its Processes the top's at their top level. A System project's trees stay as they were.
- **"Emulate on Board" is "Emulate" (#5789)** everywhere: the processes of both interfaces (the ISE style's Processes
  pane too), Emulate's bar, the Portuguese translation (Emular), the user guide's Board Emulator page.
