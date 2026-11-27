In short:

- An ASM chart's output can be set to X (don't care), as a state diagram's: `z = X`, `z = "1X0"`, `z = 3'b1x0`.

In detail:

- **An ASM chart's output set to a don't care (#4895):** a state's or a conditional output's action and a
  combinational output's default may be a don't care, the whole value's (`X`, `-`, `'-'`, `1'bx`) or some bits'
  (`"1X0"`, `3'b1x0`, `8'hx5`), with the state diagram's grammar (core/asm-expr.js `dontCareConst`, #4891); a bare `X`
  is a signal's name when the chart has a signal `X`. Its HDL is VHDL's `'-'` and Verilog's `x`; the Try it panel, the
  MCP's `simulate_drawing` and the chart's simulation show X; a register or a registered output cannot be a don't care
  (Check's error). A state diagram with a don't care now has its ASM chart (Convert to ASM chart, the ASM chart view,
  `convert_drawing`, `related_view`), which keeps it, and back: the refusal of #4891 (`asmDontCares`) is gone. The
  actions' syntax hint says so, in Portuguese too.
