In short:

- A digital circuit's row in the Design pane has a **Schematic** badge, as a Boolean algebra's: its schematic,
  generated from it and read-only, following it.

In detail:

- **A circuit's schematic (#4069):** the badge `[Schematic]` of a circuit's Design row opens a read-only schematic
  generated from the circuit (`core/circuit-sch.js`: its HDL in its logic form, the digital model synthesis reads, drawn
  by the HDL-to-schematic conversion: the gate ICs' gates as gates, the other ICs as blocks, its switches and LEDs as
  I/O markers; `web/js/drawings-circ-sch.js`), its banner's link to the circuit, redrawn when the circuit changes (out
  of sync, its errors said, while the circuit has errors); the MCP's `related_view` `schematic` of a `.circ.json`.
  Tests: `circuit-sch` (the half adder's schematic's own HDL simulated against the half adder, the breadboard example's
  blocks), `mcp-views`, UI `circuit-schematic` (new) and `circuit`, in both interfaces and Portuguese.
