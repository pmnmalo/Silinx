In detail:

- **The Gowin's and the 7-series' simulation models' steps (#4362):** the Gowin's back end hands nextpnr's routed design to the
  Post-Place & Route model (`setRouted`) and places and routes another netlist (`placeRouteNetlist`, src/nextpnr-netlist.js), and
  its steps list `postpar`; the 7-series' list `postsynth` (its Post-Synthesis model, Yosys's netlist of UNISIM's cells).
