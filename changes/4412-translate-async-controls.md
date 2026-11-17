In detail:

- **VHDL to Verilog: a process with several asynchronous controls (#4412):** a clocked process whose asynchronous
  controls come before its clock's edge, as a flip-flop's preset and clear (`if pre_n = '0' … elsif clr_n = '0' …
  elsif rising_edge(clk) …`), was refused by the translator. One reset was the only form it read. Such a process now
  becomes one `always @(posedge clk or negedge pre_n or negedge clr_n)` block with the same if / else if chain, which
  simulates as the VHDL does. #4397's ICs, written in VHDL with their Verilog translated, need it.
