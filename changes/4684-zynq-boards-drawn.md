In short:

- **The Zybo Z7 and the Arty Z7 drawn in the Board Emulator:** each as the real board, its PCB's colour included (the Zybo
  Z7 dark green, the Arty Z7 white), every part where it is; their RGB LEDs light red, green and blue.

In detail:

- **The Zynq-7000 boards drawn as the real ones (#4684):** `web/js/emulator-zybo-z7.js` (the Zybo Z7-20 / Z7-10: the
  power switch on the left edge, PGOOD its LED; LD3..LD0 over SW3..SW0; BTN3..BTN0; the RGB LED LD6; the Pmods JE, JD,
  JC and, the Z7-20's, JB along the bottom edge, JF and JA on the sides, the audio jacks; the Z7-20's Zynq under its heat
  sink and its fan connector) and `web/js/emulator-arty-z7.js` (white, its names white on black: LD5 and LD4 over SW1 and
  SW0, LD3..LD0 over BTN3..BTN0, the Pmods JA and JB on the top edge, the shield headers; the emulator's power switch by
  its power jack, LD13 its LED), after the boards' photos and reference manuals; the processing system's parts (the MIO
  LED and buttons, PS-SRST, SRST) drawn, not wired. An LED's colour may be blue (`ledLook`, an RGB LED's three LEDs).
  The docs' list of the boards drawn brought up to date. Tests: `test/ui/emu-zynq-boards.test.js` (both interfaces, in
  Portuguese), `emu-boards`' layouts, `web-markup-interpolations`' board helpers.
