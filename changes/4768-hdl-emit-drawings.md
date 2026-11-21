In detail:

- **The HDL generators' shared primitives, the drawings' family (#4768):** the ASM chart's and the state diagram's
  generators (core/asm-gen.js, core/fsm-hdl.js), the Petri net's (core/petri.js), the exercise's grading package
  (core/grade-package.js) and the module generator's Verilog ranges (core/modgen.js) use core/hdl-emit.js's `vhdlType`
  and `vlogRange` instead of their own copies (11); the generated HDL is the same, byte for byte.
