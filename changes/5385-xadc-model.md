In short:

- **The 7-series' XADC simulated:** a design that instantiates the XADC reads the die temperature, the supplies and its
  analog inputs over its DRP, its conversions' EOC, CHANNEL and EOS as UG480 gives them.

In detail:

- **The XADC's simulation model (#5385, part of #5387):** packages/silinx-hdl/src/unisim-xc7.js (its DRP, its codes,
  its conversions' timing, its sequencer's modes); its analog values set by the simulation. Tests: unisim-xc7-xadc (the
  codes of UG480's transfer functions, 26 ADCCLK cycles a conversion, the sequences and EOS, DRP writes, a forced input).
