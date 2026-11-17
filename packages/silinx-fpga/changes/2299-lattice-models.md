In detail:

- **The iCE40's and ECP5's routed design as JSON, and another netlist placed and routed (#2299):** Place & Route also writes
  nextpnr's `--write` JSON (`open/routed.json`), and the back ends' mount gives `placeRouteNetlist(text, top)` (src/nextpnr-netlist.js:
  the family's own Place & Route of the simulation model's netlist, nothing written), for the Post-Place & Route model. The
  iCE40's, ECP5's and Gowin's steps list the simulation models' (`postsynth`, and `postpar` but on the Gowin).
