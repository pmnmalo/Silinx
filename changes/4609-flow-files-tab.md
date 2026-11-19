In short:

- **Implement and Emulate: a Files tab:** beside their Implementation and Emulate tab, as Simulate's, it lists the
  design's sources, the constraints file and the memory images; a double-click opens a file.

In detail:

- **Implement's and Emulate's Files page (#4609):** a tab after the task's own, as Simulate's Files beside Simulation
  (`web/js/tasks-flow-files.js`, `core/flow-files.js` flowPageFiles): the design's sources (a drawing in place of the
  HDL generated from it), then the project's constraints and the `.mem`, `.hex` and `.coe` memory images
  (`core/flow-files.js`); a double-click opens a file, its menu is the file's (a drawing's, the drawing's); the page
  in front is the same in both tasks. It replaces the tree #4591 put above their processes, which have the whole panel
  again. The ISE style's Implementation view keeps the constraints under the top module (#4591).
