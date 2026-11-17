In short:

- **Tang Nano 9K: DDR, serialisers, LVDS and the DSPs in the open toolchain:** a design with ODDR / IDDR, OSER / IDES,
  OVIDEO / IVIDEO, IODELAY, the LVDS buffers (true and emulated), MIPI or I3C buffers, the user flash, CLKDIV, DHCEN, DCS,
  DQCE, or any DSP (MULTALU18X18, MULTALU36X18, MULTADDALU18X18, MULT36X36, ALU54D, PADD9, PADD18) now gets its
  bitstream; it was refused at Generate Programming File.

In detail:

- **The GW1N's other primitives in gowin_pack's port (#4333):** Silinx's JavaScript port of Apicula's `gowin_pack` writes
  them as Apicula 0.32 does, byte for byte on a test design each (the toolchain package's changelog lists them). A
  differential pair takes an IO_LOC for each of its two ports.
