In detail:

- **The 7-series' routed design for its Post-Place & Route simulation model (#4362):** Place & Route asks nextpnr for its
  routed design too (`--write routed.json`, in xc7ParArgs), hands it over (`setRouted`, `open/routed.json`) and places and routes
  another netlist (`placeRouteNetlist`, src/nextpnr-netlist.js); the steps list `postpar`.
