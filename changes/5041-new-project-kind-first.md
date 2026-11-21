In short:

- New Project asks first which kind of project is made: No FPGA (digital logic drawn and simulated, nothing of HDL or
  FPGA shown), With an FPGA (as before, the default) or Co-design (FPGA and microcontroller nodes: shown, not available
  yet), each said in a few words.

In detail:

- **New Project's first page, the project's kind (#5041):** three cards, each with what it is for and what it shows; No
  FPGA is the design and simulation project (#3780, #3891), its Start from (the examples, FPGA projects) not shown; the
  Project Kind field of the Create New Project page goes. Co-design is shown but cannot be chosen until the System
  document (#4697) and its editor (#4700) are built, its reason in its card. The MCP server's `new_project` takes
  `kind codesign` and refuses it with the same reason; its description says the three kinds with the dialog's words
  (`core/project-kind.js`). A UI test checks that a project with no FPGA made there shows nothing of HDL or FPGA (no VHDL /
  Verilog badges, no synthesis, implementation or bitstream processes, no board, device or constraints), in English and
  in Portuguese, in both interfaces.
