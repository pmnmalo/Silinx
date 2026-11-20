In detail:

- **The Spartan-6's own placer removed (#4776):** with Process Properties' Map (Spartan-6) set to Silinx, nextpnr places
  the design as with its own Map; the pads, the global buffers and the JTAG's BSCANs are still fixed by Silinx's rules
  first, with the same errors and warning, the ports without a LOC on bonded pads of their bank's VCCO (#4950). With
  nextpnr's Map (the default) nextpnr places the ports without a LOC itself. The toolchain's package's changelog has
  the details.
