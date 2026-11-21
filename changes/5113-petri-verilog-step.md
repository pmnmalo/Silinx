In detail:

- **A Petri net's Verilog with no warnings (#5113):** its step (the tokens taken and put, the transitions that fire) is a
  combinational block (`always @(*)`, blocking assignments) and its clocked block only registers the new marking
  (non-blocking), so Check Syntax no more warns "Blocking assignment (=) … in a clocked always block" twice for each
  place; the net behaves the same.
