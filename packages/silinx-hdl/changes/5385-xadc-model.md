In detail:

- **The XADC's simulation model (#5385, part of #5387):** src/unisim-xc7.js, written from UG480, in the 7-series'
  UNISIM models: its DRP (reads of the status and configuration registers, writes of 40h-42h and 48h-49h, DRDY a DCLK
  later), its codes (the temperature, the supplies, the unipolar inputs VP/VN and VAUX0..15, MSB-justified), a conversion
  every 26 ADCCLK cycles (DCLK / CLKDIV) with BUSY, EOC and CHANNEL, its sequencer (its default mode, single channel, one
  pass and continuous over INIT_48 / INIT_49's channels, EOS); its analog values signals a simulation sets (the die
  temperature, the supplies, VP and VAUX0..15). The event-driven mode, the alarms, the averaging and the bipolar inputs
  are not modelled.
