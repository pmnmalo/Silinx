In detail:

- **A Zynq's PS program compiled in a Docker image on the ISE machine (#4687):** besides this computer's
  arm-none-eabi-gcc, Compile PS Program can use the image `silinx/arm-none-eabi:12.2` (config.json's `armGcc.image`; built
  from Debian bookworm's gcc-arm-none-eabi and libnewlib-arm-none-eabi), over ssh as XC16's image is. The build folder is
  sent, its `build.sh` run, and its ELF brought back. config.json's `armGcc.mode` (`local` or `ssh`) chooses; without it,
  this computer's compiler is used when it has one. The MCP's `toolchain_info` says which one is used and why the other is
  not. The ssh transfer is shared with XC16's (`server/image-remote.js`). Tests: `test/zynq-ps-compile-server.test.js` (the
  fake ssh and docker), `test/zynq-ps-compile.test.js`.
