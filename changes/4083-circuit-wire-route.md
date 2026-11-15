In short:

- In the circuit editor a wire is drawn as in the schematic: a click on A, a click on B, and the wire is made in the
  circuit's style: straight, curved, or routed in horizontal and vertical segments around the parts.

In detail:

- **A wire from A to B in the circuit's style (#4083):** the circuit editor's Wire tool makes its wire from the click on A
  (a pin or a hole) to the click on B in the circuit's wire style (#4080), the clicks between them the points it goes
  through: Direct straight, Curved a curve (a sag between two points), Orthogonal routed by the schematic's router
  (`core/schpath.js` on the circuit's grid, `core/circuit-route.js` `routeOrthogonal`, `addStyledWire`): never over
  another part's pin nor into an IC, along no other wire, around the breadboard where it can, the clicks its
  waypoints; the draft shown as it will be made; a boxed-in pin's leg drawn straight, said in the console. The MCP's
  `edit_circuit` `wire` does the same, its route said. Tests: `circuit-route` (the routes checked point by point, the
  nets kept), `circuit-wires`, `mcp-circuit`, UI `circuit-wire-draw` (new) in both interfaces and Portuguese.
