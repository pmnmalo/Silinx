In detail:

- **SRL16E's IS_CLK_INVERTED simulated (#5468):** the 7-series' SRL16E (Yosys's `synth_xilinx -arch xc7`) with its clock
  inverted shifts on the falling edge in the UNISIM model, the event simulator and the compiled simulator; its
  post-synthesis model no longer warns that the generic is not modelled.
