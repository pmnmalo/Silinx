In short:

- **Verify Equivalence for larger designs:** a design with a memory or a processor, the stopwatch and micro80 examples
  among them, is now proved equivalent to a transformed copy of itself in about ten seconds, where the check used to
  stop at its time limit after two clock cycles. The smaller examples, which were only checked for some clock cycles,
  are now proved for every input sequence. A difference is still shown as a counterexample and its test bench.

In detail:

- **Verify Equivalence's engines (#3262):** first a structural proof: Yosys's equivalence passes match the two modules'
  signals by name and prove each pair equal by induction, with the initial values checked apart. If that fails, ABC
  (built into Yosys, in the browser as on the server, with no new dependency) checks the two modules as an AIG: `bmc3`
  finds the shortest difference within the depth, then `pdr` tries a proof for every input sequence (at most 10 s, as
  its memory grows with its time). A combinational pair goes to `dsat`. The counterexample is ABC's witness, replayed
  on the AIG to give each cycle's inputs and both modules' outputs, since YoWASP's Yosys has no `sim`. The proof's
  message says how it was made, and the MCP tool's `verify` returns it as `method` (`structural`, `pdr`, `reach` or
  `sat`). A bounded check whose difference pdr found later than the depth says at which clock cycle (`beyond`). Measured
  against each example's own flat Verilog: stopwatch proved in 10 s (it used to time out at 120 s with 2.3 GB), micro80
  in 12 s; mutated, each gives its counterexample at clock cycle 1 in 20 to 25 s. Verify Assertions and Verify
  Property keep Yosys's `sat -tempinduct`.
