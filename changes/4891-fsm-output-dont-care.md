In short:

- **A state diagram's outputs can be don't cares:** type `X` or `-` for the whole output, or `"1X0"` or `3'b1x0` for
  some of its bits, in the Properties, on the drawing or with the MCP. The value is shown as written, the HDL uses
  each language's don't care (VHDL `'-'`, Verilog `x`), and the simulation and the tables show X.

In detail:

- **An output set to a don't care (#4891):** a state's or a transition's output, or an output's default, can be a
  whole don't care (`X`, `-`, `'X'`, `'-'`, `1'bx`) or some bits of a vector (`"1X0"`, `"1-0"`, `3'b1x0`, `8'hx5`; a
  Verilog literal's leftmost x extended to its width). A lower-case `x` alone is a name and is still refused. The
  values are read by the new `core/fsm-value.js` and kept as written: Check, the Properties, the text typed on the
  drawing and the MCP's `set_fsm_outputs` all take them.
- **The don't care in the HDL and the views (#4891):** the generated HDL writes VHDL `'-'` / `"1-0"` and Verilog
  `1'bx` / `3'b1x0`. Both simulate with the output shown as x, and the open flow passes it to Yosys as `x`. The
  reference simulation (`stepFsm`'s `xs`), Try it, the MCP's `simulate_drawing`, the state table, the encoded table
  and Create Boolean Algebra show X; the Karnaugh maps use these bits as don't cares. An X counts as a set value for
  Check's "never set" warning.
- **No ASM chart of a diagram with a don't care (#4891):** an ASM chart has no don't care yet (#4895), so Convert to
  ASM chart, its view and the MCP refuse such a diagram and give the reasons (Portuguese too).
