In short:

- The circuit editor's Properties show the selected part's details, Part info: what it does; an IC's chip, family,
  package, supply pins, logic, delay, open-collector outputs and how an input left open reads; each pin's role.

In detail:

- **Part info (#4126):** under a selected part's fields and pinout, its details from `core/circuit-part-info.js`
  (`partInfo`): what a part that is not an IC does (a breadboard's strips and rails, the supply, the switches, a pull, an
  LED, a display, the probe) and whether it is a port of the HDL; an IC's chip, family (74LS TTL, 4000 CMOS), package,
  supply pins, logic (each gate with its pins' names), typical delay (it replaces the note under the pinout),
  open-collector outputs (the 7447's too) and how an input left open reads (TTL 1, CMOS X, as the simulation does); each
  pin's role. Translated into Portuguese. The MCP server's `circuit_parts` gives them for one part (its `info`). Tests:
  `circuit-part-info` (every part, against its description), `mcp-circuit`, UI `circuit-parts` (a 4001's, a clock's, a
  7447's in Portuguese) in both interfaces.
