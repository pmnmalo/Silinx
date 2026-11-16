In short:

- **A KiCad part modelled in VHDL or Verilog:** a part's `Silinx.HDL` property names a module of the project, and the
  circuit's HDL uses that module for the part: it simulates and synthesizes with it.

In detail:

- **A KiCad part modelled by a module of the project (#4283, #4278):** `Silinx.HDL` on a symbol names a VHDL entity or
  a Verilog module of the project. Its ports are the part's pins (by their names, or as `Silinx.Ports` maps them; the
  supply pins are no ports). The circuit's generated HDL instantiates it in its simulation's model and in its digital
  one (`core/circuit-kicad-hdl.js`, `core/circuit-hdl.js`, `core/circuit-digital.js`), and the module is not copied
  into the circuit's file. Check Circuit, given the project's modules (the editor's, `check_drawing`'s, `edit_circuit`'s),
  refuses a module missing, a port without a pin, a pin without a port, a direction or a width that differ. It warns
  "U1 (TEST-INV) is simulated by its module test_inv in the HDL only: Try it does not run it".
- **In the editor (#4283):** such a part has a whole outline, its tip and Part info name its HDL module, and Import
  KiCad Part… has an HDL module column. `import_part`'s `symbols.<name>.hdl` and `ports` write the properties. Portuguese
  too.
