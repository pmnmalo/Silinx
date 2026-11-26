In short:

- **The examples' display, LEDs and switches on the Pmods emulated:** on the Zybo Z7, the Arty Z7 and the Arty S7, what
  an example needs and the board lacks (stopwatch's and pong's display, micro80's switches) is drawn on a breadboard under
  the board, named with its Pmods, and runs in the Board Emulator; no longer "not emulated".

In detail:

- **The modules on a board's headers (#5641):** `core/emulate-headers.js` `withHeaderModules` reads the design's ports
  the constraints put on the board's header pins (group 'Headers': the Pmods, the Arty Z7's shield header) and makes
  each kind (led, sw, btn, seg, dp, an, vga_*) a resource of the board (`pmod_led`, `pmod_sw`, `pmod_btn`, `seg`, `dp`,
  `an`, `vga_*`: its pins in the bits' order, the Pmods it is on, its first bit); `boardWiring` wires them (its
  `wiring.board`, the System Emulator's too), a module's switches and buttons as switches and buttons. The Zybo Z7's and
  the Arty Z7's drawings show them on a breadboard under the board (`web/js/emulator-pmods.js`; hidden as a module,
  *Modules on the headers*, the room given back under the board), the rows of a board with no drawing (the Arty S7's)
  too. Tests: `test/emulate-headers.test.js` (the modules against the constraints' text on four boards, stopwatch's
  display on the Zynq boards on both engines), `test/ui/emu-zynq-boards.test.js` (the breadboard, its parts and their
  Pmods, the module hidden and shown; the Arty S7's rows).
