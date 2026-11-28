In detail:

- **The real compilers in the ISE runner's nightly (#6019):** `ise.yml` checks the images `silinx/xc16:2.10` and
  `silinx/arm-none-eabi:12.2` in the runner's own Docker and runs the tests that need a real compiler on them
  (`SILINX_TEST_COMPILERS=docker`, `test/compilers-lib.mjs`; a config.json's path instead: the ISE machine's images
  over ssh): the drawings' C on the PIC24 by XC16 (`test/reactive-pic24.test.js`), the starter linked by
  arm-none-eabi-gcc (`test/zynq-ps-compile.test.js`, which reaches the image now, as XC16's test does), and every
  Zynq example's PS program and every PIC24 example's program with no warning, XC16's `.hex` of uart-pic24 run on
  silinx-pic24 as the example's own (`test/examples-compilers.test.js`). Asked for, a compiler that is missing fails
  its test, never skips it. XC16 and arm-none-eabi-gcc take a third mode, `docker` (config.json's `xc16.mode`,
  `armGcc.mode`): the image in this computer's Docker, the build folder at `/work`, no ssh; `toolchain_info` says so.
