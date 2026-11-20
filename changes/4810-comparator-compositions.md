In short:

- The comparators of the schematic palette can be pushed into too: COMP8 of two COMP4, COMP4 of four XNOR and an
  AND; A < B the borrow of a subtractor, its sign bits inverted when signed.

In detail:

- **The compositions of the comparators (#4810, part of #4806):** `core/symlib-comp.js`, generated from the symbol's
  parameters as the adders' are:
  - EQ: COMP4 is four XNOR2 (each bit's A = B) and an AND4; a wider one is blocks of COMP4 (COMP16 of four, COMP64 of
    four COMP16) and an AND of their EQ.
  - LT: the borrow out of A − B, an SUB n's (#4807). Signed operands have their sign bits inverted first, through a bus
    join: the order of two's complement numbers is the unsigned order with their sign bits flipped.
  - The other results come from these two: NE = not EQ, GE = not LT, LE = LT or EQ, GT = not LE.
  - Pins per bit are joined into buses by bus joins.
- **Tests:** every operation, signed and not, is proved equivalent to the symbol's own HDL (Yosys, VHDL and Verilog)
  and simulated against a two's complement model, every level drawn with no warnings. They are views: the HDL
  generated for the symbol is unchanged.
