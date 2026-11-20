In short:

- A Zynq-7000 board's PL programmed over JTAG past the processing system's ARM DAP, from the browser (WebUSB) and from the
  local server (openFPGALoader); the Program view shows the chain's two devices.

In detail:

- **The Zynq-7000's JTAG chain (#4683, #4679):** in cascade, TDI first, the ARM DAP (the processing system's debug port: IR
  of 4 bits, IDCODE 0x4BA00477) then the PL's TAP (UG585). The chain's IDCODEs know the DAP, the XC7Z010's and the
  XC7Z020's (`core/adept.js`), so the browser edition's FT2232H programming (`core/ftdi-jtag.js`) finds both and configures
  the PL as an Artix-7, the DAP in BYPASS throughout. The Zybo Z7's and the Arty Z7's `jtagChain` list both (the Program view: the ARM DAP
  in bypass, the FPGA selected). On the local server openFPGALoader picks the chain's one FPGA itself (its index 0, from
  TDI, is the DAP): no `--index-chain` for a Zynq's `.bit`. The test board's simulator has the DAP before the PL. The
  position the Program view sends to the other tools, an older mismatch, is #4940.
