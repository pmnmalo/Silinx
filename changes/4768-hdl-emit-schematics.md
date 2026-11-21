In detail:

- **The HDL generators' shared primitives, the schematics' family (#4768):** the schematic's HDL (core/schdoc-hdl.js,
  its symbols' registers in core/schdoc-hdl-symbol.js), the ISE library's flip-flops (core/isesch-hdl.js) and the logic
  analyzer's capture bench (core/ila-capture.js) use core/hdl-emit.js's `vhdlType` and `vlogRange` instead of their own
  copies (5; theirs wrote `w > 1 ? … : 'std_logic'`, the same text for every width of a design, 1 or more); the
  generated HDL is the same, byte for byte.
