In short:

- **Decoders, display drivers and encoders:** the 7442, 74145, 74137, 74237, 74238, 74154, 74155, 74156, 7446, 7449,
  74147 and 74148, in the Parts panel's MSI group (now "MSI (74LS, 4000)") and as KiCad's parts: they decode in Try
  it, in the circuit's HDL, simulated and built. KiCad's 74LS48 behaves as the 7448.

In detail:

- **Decoders, display drivers and encoders written once in VHDL (#4397, group F):** `core/circuit-model-decoders.js`
  adds 12 ICs as the shift registers of group E are, their logic sums of products of their inputs; the 74137 and 74237
  latch their address as the chips do. A KiCad open-collector pin fits an output the chip pulls up inside (the 7448's
  segments), so KiCad's 74LS48 behaves as the 7448. A library IC on a 24-pin DIP (the 74154) is 0.6 inch wide, and
  exported to KiCad on `DIP-24_W15.24mm`. The catalogue's KiCad logic ICs that behave go from 207 to 224. The 4056
  stays drawn only (its third supply, VEE); the 4028, 4543, 74246–74249 and 74348 too, until their datasheets' tables
  are checked.
