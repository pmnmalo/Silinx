In short:

- The adders and subtractors of the schematic palette built of others, down to the gates: ADD8 of two ADD4, ADD4 of
  four FA1, FA1 of two XOR, two AND and an OR; SUB8 an ADD8 with B and the borrows inverted. Symbol Info's MCP tool
  lists the levels and `symbol_composition` draws each one; opening them in the schematic editor comes next (#4808).

In detail:

- **The palette's compositions, the adders and subtractors (#4807, part of #4806):** `core/symlib.js` gives a symbol's
  composition, generated from its parameters: a small library of modules, each an ordinary schematic whose instances
  are the modules of the level below (`core/symlib-draw.js`, `core/symlib-add.js`). ADD n is a ripple-carry chain of at
  most four blocks (FA1 up to 4 bits, ADD4 up to 16, ADD16 up to 64…, the rest a smaller block: ADD10 is two ADD4 and an
  ADD2), the carries running upwards (a block's carry in below it, its carry out above it), the operands' and the sum's
  bits joined to each block by their wires' names (A(7:4)); no carry in: GND; no carry out: open; a pin per bit: the
  bus form between bus joins and bus taps. SUB n = A + not B + not BI on an ADD n (no borrow in: 1). They are views: the
  HDL generated for a symbol stays its own (#4806's measurements: composed arithmetic is slower with XST and with the
  Silinx toolchain), each composition proved equivalent to it (Yosys, in VHDL and in Verilog) and simulated against a
  model by `test/symlib.test.js`, every level drawn with no warnings, no clash and no wire crossing.
- **MCP:** `symbol_info` lists a symbol's composition's levels (ADD8 = 2 × ADD4, …); `symbol_composition` returns a
  level's drawing, as `read_file` returns a schematic, for an assistant to walk down them as a student will.
