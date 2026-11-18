In detail:

- **nextpnr-himbaechel-gowin's routed cells (#4362):** the ALU's `RAW_ALU_LUT` (the slice's LUT itself, as Apicula's chip
  database gives each mode's: S its bit {I3 1 I1 I0}, C its bit {0 0 I1 I0}, an open input that does not change it left
  open, an open CIN 0) natively too, and `CIN_NETTYPE`; GOWIN_VCC, GOWIN_GND and DUMMY_CELL; the I/O buffers' `NET_*`
  generics (ignored, with no warning); a LUT's open input reads 1.
- **The 7-series' UNISIM primitives (#4362):** src/unisim-xc7.js, part of UNISIM's library: DSP48E1 (its registers, INMODE's
  pre-adder, the multiplier, OPMODE's X, Y and Z, ALUMODE's sums and logic, CARRYINSEL, the pattern detector; USE_SIMD other
  than ONE48 a warning), RAMB18E1 and RAMB36E1 (TDP with a port's read and write widths apart, SDP of 36 / 72 bits, byte
  write enables, WRITE_MODE, the output register, RSTRAM / RSTREG, INIT and SRVAL; an unknown bit of the contents, INIT or
  SRVAL 0). The distributed RAMs' open data inputs read 0 (RAM32M's DID, which synth_xilinx leaves open).
