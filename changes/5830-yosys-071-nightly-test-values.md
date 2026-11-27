In detail:

- **Yosys 0.71: three tests' values made 0.71's (#5830):** cmpProbe's comparisons named by their source line
  (`$t_syn.v:12$gt$2`, still selected by `select -read`), #652's I2C sequencer in 130 LUTs and 69 slices in VHDL and 128
  and 68 in Verilog (0.70's 126 and 67: the same netlist ordered otherwise, #5815, its round, multiplexers and period as
  before), the latch fixture's warnings with their process named by its line; each with 0.70's beside it.
