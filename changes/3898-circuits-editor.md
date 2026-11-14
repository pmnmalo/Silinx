In short:

- **Digital circuits on a breadboard:** New Source ▸ Circuit: real ICs (7400, 7404, 7408, 7432, 7486), logic switches,
  push buttons and LEDs wired on a breadboard, simulated live with the gates' delays (a click on a switch lights the LEDs);
  Check says the short circuits, the unpowered ICs and the floating inputs. In Portuguese too.

In detail:

- **The circuit editor (#3898, part of #3897):** `web/js/circuit-editor.js` and its modules (`circuit-draw.js`,
  `circuit-toolbar.js`, `circuit-side.js`): the breadboard, the ICs with their notch and pins, switches, buttons, LEDs and
  the supply drawn on the 0.1 inch grid; the parts library in the Properties panel, a part placed by a click, moved, turned
  (R), deleted; a wire drawn point by point, ended on a pin or a hole; Simulate (each pin's level, the LEDs lit, the time in
  the status line, a button held while pressed, an oscillation or a short in the console); Check in the console; Undo /
  Redo of the main toolbar; the HDL file made on save. The Design pane's row `[Circuit]` … `[VHDL]` / `[Verilog]`, New
  Source ▸ Circuit (in a design and simulation project too), its icon, Print, rename, the drawing kinds' lists of the
  project, the import, the design-only checks; its Portuguese labels (`web/js/i18n-circuit.js`).
