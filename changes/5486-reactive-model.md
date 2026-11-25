In detail:

- **The synchronous reactive model (#5486):** the neutral model a drawing is turned into to run on a CPU
  (`core/reactive.js`, its semantics in `docs/SYSTEMS.md`, "The synchronous reactive model"): inputs sampled once per
  tick, reads of the present values, Moore and Mealy outputs, the guards in their priority, timers counted in ticks, the
  reset state. A state diagram, an ASM chart, a Petri net and a truth table are turned into it
  (`core/reactive-from.js`, `core/reactive-asm.js`), each by its HDL's semantics; a schematic, a circuit and a register
  map are refused with their messages. Tests: each translation run tick by tick against the drawing's VHDL and Verilog
  simulated (the traffic FSM, the lock's ASM timer and alarm Petri net, the traffic lamps' truth table, and edge cases)
  and against the drawings' own simulators.
