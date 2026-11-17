In detail:

- **VHDL to Verilog: the lint's `silinx: ignore` comments kept (#4414):** the translator carried no comment over, so a
  VHDL source's lint suppressions (`-- silinx: ignore latch`, `-- silinx: ignore data-as-clock`) were lost and its
  Verilog warned where it did not. A suppression on a process's or an if / elsif branch's line, or alone on the line
  above it, now ends that statement's Verilog line (`if (en) // silinx: ignore latch`,
  `always @(posedge clk) begin // silinx: ignore data-as-clock`). The translation's lint is then as clean as its
  source's. #4397's ICs written once in VHDL no longer need their Verilog patched.
