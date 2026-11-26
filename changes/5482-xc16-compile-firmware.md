In short:

- **Compile Firmware for the PIC24:** a PIC24 node of a System (the Explorer 16/32) compiles its C and assembly with
  XC16, installed on the computer or in its Docker image on the ISE machine. The errors and warnings go to the console
  by file and line, and the `.hex` becomes the node's firmware, which Emulate System runs.

In detail:

- **A PIC24 node's firmware compiled by XC16 (#5482):** the Explorer 16/32's row in the Design pane and in the Implement
  tree has Compile Firmware (`web/js/system-processes.js`, `web/js/system-implement-tree.js`), the job of
  `server/xc16-compile.js` (POST `/projects/:p/firmware`, as an Arduino's). The node's folder's `.c`, `.h`, `.s` and
  `.S` files (`core/xc16-compile.js`) are copied into `build/nodes/<id>/firmware/src/`; `xc16-gcc
  -mcpu=24FJ1024GB610 -omf=elf -O1 -Wall` with the device's linker script (`-T`) and a heap (`-Wl,--heap=512`) links
  them to an ELF, and `xc16-bin2hex` writes its `.hex`: over the node's firmware, or to `<id>/<id>.hex`, which becomes
  the node's firmware. XC16's free licence optimises up to `-O2`: Silinx uses `-O1`, said in the console. gcc's, the
  assembler's and the linker's errors and warnings become ERROR / WARNING lines by the project's file and line.
  XC16 is the user's, never shipped: found on this computer (config.json's `paths.xc16`, the PATH,
  `/Applications/microchip/xc16/*/bin`, `/opt/microchip/xc16/*/bin`) or, as ISE is, in the Docker image `silinx/xc16:2.10`
  on the ISE machine over ssh (its build folder under `ssh.remoteDir`); config.json's `xc16.mode` and `xc16.image`
  choose. `detectXc16` says which one is used and why the other is not. The build plan compiles a PIC24 node with C
  (`core/system-plan.js`, Build All); one with a `.hex` and no C stays given. Without XC16, and in the browser edition,
  Compile Firmware says what is missing (Portuguese, `web/js/i18n-system.js`).
  MCP (#2674): `run_process` process `firmware` on a PIC24 node, the same messages; `toolchain_info` gives XC16's
  version and where it runs (descriptions shortened, tools/list's size kept). docs/SYSTEMS.md: compiling a PIC24 node's
  firmware. Tests: xc16-compile (the device's options, the sources, the commands, the image's script run by bash,
  XC16's messages), xc16-compile-server (a stand-in for XC16, `test/fixtures/xc16-stub`: the exact lines, the
  refusals, the ISE machine's image through a fake ssh and docker, the `.hex` run by the emulator, `run_process`,
  `toolchain_info`; the real XC16, when installed), ui/system-firmware-pic24 (both interfaces, Portuguese, the browser
  edition).
