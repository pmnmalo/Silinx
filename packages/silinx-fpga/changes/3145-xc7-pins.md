In detail:

- **The 7-series' pins checked in the bitstream (#3145):** the bit database keeps the package's IOB pins (`pins`, from
  Project X-Ray's `package_pins.csv`; `research/xc7/build-db.mjs`); `src/fpga/xc7/pins.js` compares the IOBs a `.bit`
  configures (read back) with the XDC's pins, directions and IO standards; `src/fpga/xc7/check.js` (`checkBitXc7`) runs
  the frames', round trip's and pins' checks of a `.bit` together. `roundTrip` also returns the features read back.
