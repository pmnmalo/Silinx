In detail:

- **The HDL generators' shared port lists and headers (#5076):** core/hdl-emit.js now also writes a port (`vhdlPort`,
  `vlogPort`), a port list (`vhdlPortLines`, `vlogPortLines`: aligned columns, indents, a mode's or a direction's width)
  and an entity's or a module's header (`vhdlEntity`, its generics and its three ends; `vlogModule`, its parameters, or
  on one line), and the C generators' ports of a width (`vhdlWidthPorts`, `vlogWidthPorts`); core/hdl-emit-fsm.js the
  state machines' skeleton the ASM chart's and the state diagram's generators shared (the entity and the module, clock
  and reset first in an aligned table; the state type and its constants). The generators use them instead of their own
  copies (43 port lists, one family at a time): the drawings' (core/asm-gen.js, core/fsm-hdl.js, core/petri.js,
  core/logic.js, core/grade-package.js, core/modgen.js), the schematics' and the circuits' (core/schdoc-hdl.js,
  core/circuit-hdl.js, core/circuit-hdl-ics.js, core/circuit-hdl-core.js, core/circuit-model-ics.js) and the C / HLS
  ones (core/c-hdl.js, core/c-hdl-seq.js, core/c-axi-rtl.js, core/c-axis.js, core/c-processes.js,
  core/c-processes-word.js, core/c-blackbox-process.js, core/hls-fir-hdl.js, core/hls-fft-hdl.js,
  core/hls-fft-float-hdl.js). The generated HDL is the same, byte for byte.
