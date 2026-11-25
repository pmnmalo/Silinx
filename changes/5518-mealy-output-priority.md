In short:

- **State diagrams' Mealy outputs:** a transition that sets no output, when it is taken, no longer lets a later
  transition's outputs through in the generated VHDL and Verilog.

In detail:

- **A state diagram's Mealy output logic keeps every transition, in their order (#5518):** the output logic's
  `if` / `elsif` chain of a state (3 processes) left out the transitions that set no output before the last one that
  sets some, unless their conditions overlapped a later one; the otherwise transition was never counted as overlapping,
  so with `x && k == 2 / y = 3`, `k > 2'd2` (no output) and otherwise `/ z = 1`, the HDL set `z` when `k = 3`, where the
  diagram (and its simulation) take the second one and keep `z` 0. Every transition up to the last one with outputs is
  now in the chain, the ones with none an empty branch (`null;` in VHDL, `begin end` in Verilog); the next-state logic
  was right. `core/fsm-hdl.js`. The examples' state diagrams give the same HDL as before.
