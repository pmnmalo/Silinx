In detail:

- **The HDL generators' shared primitives, the last copies (#4768):** the module generator's VHDL type (core/modgen.js)
  and the Petri net's ports (core/petri.js) use core/hdl-emit.js's `vhdlType` too; the generated HDL is the same, byte
  for byte (their copies wrote `w > 1 ? … : 'std_logic'`, the same for every width, 1 to 256, a port can have).
