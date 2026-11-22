In detail:

- **Usability tests: random sequences for the drawings (#5206, its third phase):** the schematic's and the circuit's
  seeded generator (`lib/random.js`, `lib/random-run.js`: the fixed seeds and the week's, replayed, shrunk) given to the
  state diagram (`test/usability/fsm-random.test.js`, on the traffic example), the ASM chart (`asm-random.test.js`, the
  lock's timer), the Petri net (`petri-random.test.js`, the lock's alarm) and the truth table
  (`truthtable-random.test.js`, the traffic lamps), each its vocabulary (`lib/fsm-random.js`, `asm-random.js`,
  `pn-random.js`, `tt-random.js`): states, boxes, places, transitions, inputs and outputs added where nothing is, moved,
  linked (a transition drawn and its condition typed in place, an exit dragged to a state box, an arc), renamed, deleted,
  a Properties edit (an output's value, a condition, a guard, tokens, a weight, a cell, an expression, a NAND form), Undo,
  Redo; only steps a person could make on the drawing as it is. After every step the drawing's check (its errors but
  those a step may make, named with their reason), the HDL compiled and elaborated in VHDL and Verilog, and the drawing's
  model, each step's own (`lib/draw-random.js`), the editor's document; at the end Undo to the start and Redo to the end.
  A step that cannot be done says the steps before it. In both interfaces and in Portuguese, about 3 minutes in all; the
  bugs it found are todos: #5266 (a Petri net's two arcs between a place and a transition drawn on one line), #5268 (the
  truth table's focused box after Undo). The editors' actions of the scripted sessions moved to `lib/fsm-actions.js`,
  `lib/pn-actions.js`, `lib/tt-actions.js`.
