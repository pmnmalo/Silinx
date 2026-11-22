In detail:

- **Usability tests, every week (#5148, its first part):** `test/usability/` exercises Silinx as people use it, in long
  sessions of steps through the interface, each step checked: the drawing's invariants (no wire end left on nothing, no
  wire over a pin or through a body, no overlapping symbols, the junction dots), the wires that were attached still
  attached, the nets, the HDL made in VHDL and Verilog and elaborated, Check Schematic's warnings exactly, and Undo back
  to the start and Redo to the end. This part covers the schematic's wires on the gates example: wires drawn pin to pin
  and onto a wire (a T-junction), segments and symbols dragged with their wires, a symbol's width and a gate's inputs
  changed; and random sequences of those steps with a fixed seed (the week's seed too), a failing one shrunk to the
  steps that reproduce it. A new workflow, `.github/workflows/usability.yml`, runs them every Sunday and by hand on any
  branch (never on pull requests), in both interfaces and in Portuguese, in parts under 15 minutes
  (`scripts/test-shard.mjs --usability`); a scheduled run's failure opens an issue that quotes the scenario's report
  (its seed, its steps, what broke, the command that replays it: `scripts/report-failure.mjs`), its screenshots kept as
  the job's artifact. The bugs they found are issues of their own: #5153, #5154, #5155, #5156, #5159 (their scenarios
  marked to do until they are fixed).
