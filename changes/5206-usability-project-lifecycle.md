In detail:

- **Usability tests: the project's lifecycle (#5206, its second phase):** `test/usability/project-lifecycle.test.js`: a
  project made with New Project… (its wizard, the Basys2, VHDL), a source of each kind New Source… offers (a VHDL and a
  Verilog module with their ports, a schematic, a state diagram, an ASM chart, a Boolean algebra, a Petri net, a circuit,
  a test bench, a constraints file, a memory file, a C and a C++ function, a guided lab, the Clocking Wizard's and the
  Block Memory's modules), the top set from a module's row, the Petri net removed (Undo, Redo), the VHDL module renamed
  (its file and the bench that instantiates it), the top changed, Export Project (.zip)…, Import Project… of that zip as
  a new project, closed and opened again. After every step the page and the disk agree with the project's model
  (`lib/project-model.js`, `lib/project-session.js`): the Design pane's rows, the top, the editors open, silinx.json and
  every file of the folder, the modules of its HDL compiled, the console's lines exactly, no warnings. In both interfaces
  and in Portuguese; the bugs it found are todos: #5250, #5252, #5253, #5254.
