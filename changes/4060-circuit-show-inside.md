In short:

- The circuit editor's **Show inside** draws the gates inside each IC and the strips of each breadboard; its ⋮ menu draws
  the wires as curves (**Curved wires**) and with **Hop-overs** where they cross, as the schematic's.

In detail:

- **Show inside (#4060):** a tick box of the circuit editor's toolbar (remembered): each breadboard's strips under its
  holes, each gate IC's gates (IEC boxes joined to its pins, a bubble on an inverting one), another IC's pins named
  inside it (`web/js/circuit-draw-inside.js`).
- **Curved wires and Hop-overs (#4064):** the circuit editor's ⋮ menu: Curved wires (the circuit's `wireStyle`, an edit,
  undone by Undo; the MCP's `edit_circuit` `wires`) and Hop-overs (remembered, on by default); `core/circuit-wires.js`
  (the curves, the crossings, the arcs). The toolbar's options moved to `web/js/circuit-options.js`. Tests:
  `circuit-wires` (the crossings against ones reckoned by hand), `mcp-circuit`, UI `circuit-look` in both interfaces
  and Portuguese.
