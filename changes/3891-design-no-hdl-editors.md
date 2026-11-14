In short:

- **No HDL in a design and simulation project's editors.** The schematic has no HDL kept with its sheet, no HDL type
  for its I/O markers, no HDL BLOCK nor device primitives in its palette; the state diagram's, the ASM chart's and the
  truth table's panels and tips say nothing of HDL, VHDL or Verilog (Parameters for Generics).

In detail:

- **A design and simulation project without HDL, part 3 (#3891):** in a design project (the page's kind flag,
  web/js/project-kind-flag.js) the schematic's sheet leaves out its section "HDL kept with the schematic" and the HDL
  in its Description's note, an I/O marker its HDL type, a flip-flop's input its "no such Xilinx flip-flop", an
  instance's Generics are its Parameters; the palette has no HDL BLOCK, no Device Primitives category, a project
  module's tip its ports alone; More…'s and Curved wires' tips and Check's "HDL generation failed" leave out the HDL;
  the state diagram's description placeholder, the ASM chart's Generics (Parameters) and their hint, the truth table's
  tick boxes' tip; the state diagram's and the truth table's "Not in sync with x.vhd" is not shown. The MCP server's
  `related_view` results say Logic for HDL logic there and refuse the VHDL and Verilog notations, as the editor
  offers none.
