In short:

- **A state diagram's schematic:** Show Schematic Beside, in a state diagram's tab menu and in View, shows its classic
  implementation: a D flip-flop per state bit and the next-state and output logic in minimal gates. It is read-only
  and you can try it in place. A machine with no state codes (enumerated, one-hot) or too many bits for its tables
  has no schematic, and the console says why.

In detail:

- **A state diagram's schematic (#4911):** `core/fsm-sch.js` `fsmSchematic` draws a state diagram's classic
  implementation, not the synthesis's RTL view. The state register is a palette flip-flop per state bit of its
  encoding: FDC / FDP with an asynchronous reset, FDR / FDS with a synchronous one, each reset to the bit of the reset
  state's code, and an active-low reset goes through an inverter. The next-state and output logic is the truth tables
  of Create Boolean Algebra (`truthTablesOf`, the unused codes don't cares), drawn as a truth table's schematic is
  (`schematicFromTable`). The state bits and the next-state bits are named nets (q1, d1…), and each input and output
  bit is a port of its own. It opens beside the diagram (`fsmsch:` documents, `web/js/related-docs.js`), and the MCP
  server's `related_view` makes it (view `schematic` of a `.fsm.json`). The examples' state diagram (traffic), in VHDL
  and Verilog, in the gray encoding, and Moore and Mealy machines with every kind of reset are simulated equal to the
  diagram's model.
