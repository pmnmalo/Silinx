In detail:

- **The release zip within its budget again (#5816):** the ESP32 node's MicroPython package's three builds the app never
  loads (`micropython.wasm`, `micropython-ulab.wasm`, `micropython-settrace-ulab.wasm`, 0.7 MB zipped) left out of the zip
  (scripts/zip-trim.mjs), its module and the settrace build kept; the budget raised to 48 MB zipped and 156 MB unzipped
  (test/release/release.test.js) for Yosys 0.71's WebAssembly (+1.6 MB zipped) and the ESP32's and the Pico's emulators.
  The zip is 47.5 MB, unzipped 152.5 MB. The standalone build carries none of the MicroPython package.
- **The release test lists the Cyclone V's nextpnr among the packages downloaded on first use (#5958)**, as
  scripts/downloaded-packages.mjs has it since the Cyclone V's open flow.
