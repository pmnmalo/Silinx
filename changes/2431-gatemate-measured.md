In detail:

- **The GateMate measured (#2431):** `scripts/gatemate-measure.mjs` builds each example on a Cologne Chip GateMate with the
  open tools, outside the IDE: the Silinx toolchain's flat Verilog (as a ULX3S project) through Yosys's `synth_gatemate
  -luttree -nomx8`, nextpnr-himbaechel's gatemate and Project Peppercorn's gmpack, YoWASP's
  `@yowasp/nextpnr-himbaechel-gatemate` 0.11.825 (a development dependency), each bitstream read back by gmunpack and
  compared with nextpnr's configuration setting by setting, and prints a table per part. Every example builds on the
  CCGM1A1 (the GateMate A1 Evaluation Board's) with seed 1 and no warning but micro80's memory resized, the 25 MHz met; with
  seeds 1 to 5, nextpnr crashed on one build, gmunpack on two, and five lost one or two flip-flop initial values on reading
  back. The CCGM1A2 crashes nextpnr on every example. `test/gatemate-measure.test.js` (the script's parts; gates and blinky
  built on the CCGM1A1); the results in docs/TOOLCHAIN.md. The GateMate is not a family of Silinx yet.
