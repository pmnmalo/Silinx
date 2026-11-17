In detail:

- **What proves an iCE40 or ECP5 build (Fixes #2301):** `npm run check:lattice-flow` (scripts/check-lattice-flow.mjs) builds
  every example on the iCEBreaker and the ULX3S as the application does, and checks each three ways: nextpnr's timing
  meets the board's clock (`icetime` is not in YoWASP's packages); the bitstream read back by `iceunpack` / `ecpunpack` and
  packed again by `icepack` / `ecppack` is the same bytes; and the Post-Place & Route model (#2299) runs the example's test
  bench as the project's RTL does, the same log line for line, with no warning. It prints a line per example, and the failures. docs/TOOLCHAIN.md's "How a result is checked" says
  so in place of "to be decided". Test: check-lattice-flow (blinky on both boards; a bitstream packed again otherwise and a
  model that fails its test bench, each said).
