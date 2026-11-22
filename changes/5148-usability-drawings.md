In detail:

- **Usability tests: the state diagram, the ASM chart, the truth table and the Petri net (#5148, its fourth part):**
  `test/usability/fsm.test.js` (the traffic example's state diagram: a state added, named and wired with transitions
  drawn from its rim, states dragged with their transitions, a state renamed in place, a phase and a condition set in
  Properties, a transition and a state deleted), `asm.test.js` (the lock example's timer: a state, a decision and a
  conditional output added on free exits and connected, boxes dragged and nudged, names, conditions and outputs typed,
  a box and an arrow deleted and drawn again), `truthtable.test.js` (a new table, the traffic lamps and the lock's
  digit_ok: inputs and outputs added, cells clicked to 0, 1 and X, an expression, the Karnaugh map, a NAND form, an input
  removed) and `petri.test.js` (the lock's alarm net: a place and a transition added and linked, a guard and tokens,
  nodes dragged, a transition and an arc deleted, an arc's weight, an inhibitor arc, an arc refused). After every step
  the drawing's Check has no error and its HDL compiles and elaborates in VHDL and Verilog; Check's warnings exactly;
  Undo back to the start and Redo. The bugs they found are issues of their own: #5164, #5165, #5167, #5168 (their
  scenarios marked to do).
