In short:

- **VHDL to Verilog:** a concurrent assignment's `-- silinx: ignore …` comment is kept, at the end of its `assign`
  line, so the translation no longer warns where the VHDL does not.

In detail:

- **VHDL to Verilog: a concurrent assignment's lint suppression kept (#4436):** #4414 carried the lint's
  `silinx: ignore` comments over on processes and if / elsif branches only; a concurrent assignment's (on its line or
  the line above, the 74190's `rco_n <= …` with `clock-as-data`) now ends its `assign` line (or its delayed
  assignment's `always` line).
