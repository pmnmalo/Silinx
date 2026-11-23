In short:
- A schematic's ADD with a carry in, or SUB with a borrow in, makes one adder in VHDL, as in Verilog: half the size on the Silinx toolchain, and no second subtractor in XST.

In detail:
- The VHDL of a schematic's ADD with CI and SUB with BI (core/schdoc-hdl-more.js, the bus and pin-per-bit forms) and of an ISE schematic's ADD / ADSU (core/isesch-hdl.js) is one sum with the carry an operand, `resize(A) + resize(B) + unsigned'(0 => CI)`, instead of two sums and a choice (`… + 1 when CI = '1' else …`): on the Silinx toolchain ADD 16 with CI 33 → 16 LUTs and a carry chain of 66 → 33 cells, SUB 16 with BI 66 → 33 carry cells; XST built SUB's two subtractors (#4780).
