In short:

- **ISE and a VHDL top with integer ports:** a top-level port of type `integer range …` (ITC'99's `data_in : in integer
  range 127 downto -128`) now gets pins for the bits XST makes of it (8 there), not 32: ISE's Translate refused the
  pins Silinx gave the others (`ConstraintSystem:59`).

In detail:

- **The pins of an integer port with a range (#3820):** `core/auto-pins.js` (the port bits with no LOC, to which the
  ISE flow gives free pins) gave every VHDL integer port 32 bits, `x<0>` to `x<31>`; XST makes an integer with a range
  only its range's bits (`integer range 63 downto 0`: 6; `127 downto -128`: 8, signed), so ngdbuild refused the LOCs of
  the bits its netlist does not have. `portWidth(t)` gives XST's width (a plain integer: 32), for the pins and for a
  UCF's bus bits.
- **The Quality comparison's I/O wrapper (#3820):** the corpus's wrapper (`test/designs-corpus/lib.mjs` `wrapperPorts`)
  connects such a port with those bits too: XST refused the 32-bit connection to a VHDL port of 20 or 30 bits
  (`Xst:2587 … has different type in definition`: ITC'99's b14, b15, b17). Both fixed, the weekly Quality run builds
  with ISE the ITC'99 designs it failed on (b04, b07, b11, b13, b14, b15, b17, b20, b21); femtorv32's `instr`, used before its
  declaration, stays XST's own limit, listed so on the Quality page. itc99-b15, whose wrapper XORs
  two bits fewer (1321 slices, 20.06 ns against 1336, 19.77), gets the corpus's PERIOD of 22 ns (`periodNs`, as #440's
  designs within a few per cent of 20 ns): its warning that 20 ns is not met would flip from run to run. Tests: `test/auto-pins.test.js` (the widths, the
  pins, a UCF's LOCs), `test/designs-corpus.test.js` (b14's wrapper: its connections, elaborated with no warning).
