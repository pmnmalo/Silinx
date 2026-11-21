In detail:

- **The hidden REG symbol removed (#5030, #4806's D2):** a register is a flip-flop of the FD family with a Width (FD,
  FDE, FDC, FDCE, FDR, FDRE…). What still reads a REG reads it as the FD of its options, its Width kept and its pins
  the same (D, CE, C, CLR / R, Q):
  - a drawing saved with a REG, when it is opened;
  - an HDL file whose block was a REG's (`silinx-symbol register`), turned back into a schematic;
  - an ISE schematic's FD8CE / FD16CE / FD8RE / FD16RE;
  - a schematic exported to ISE as a REG (`xl_reg…`) and imported back.
- An FDCE / FDRE of 8 or 16 bits with INIT 0 is exported to ISE as the library's FD8CE … FD16RE, and has them among
  its Xilinx equivalents.
- A REG's INIT word becomes the FD's INIT, one bit for all of them: 1 when it was all ones, else 0.
- The parts panel draws a register IC (74164, 74374…) as an FDCE.
