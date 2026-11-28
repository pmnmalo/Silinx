In short:

- **The Raspberry Pi Pico in Emulate:** a Pico or Pico W node now shows its board in the System Emulator, each pad's
  level and the Pico's LED, and the MCP's `simulate` reports it too.
- **The ESP32's board line:** `simulate` no longer says an ESP32 DevKitC has an "LED L".

In detail:

- **A Pico's board in the System Emulator (#5909):** core/system-emu.js gives an RP2040 node a board to emulate: its
  pins, and its LED on GP25 (a Pico W's LED is its wireless chip's, so it has none). web/js/emulator-pico.js `picoLayout`
  draws it on the Pico's own drawing (#5898), each pad's level shown and the LED lit as GP25 drives it, and
  web/js/system-emu-view.js mounts it. Portuguese.
- **Each microcontroller's board line names its own LED (#5882):** server/mcp-system-sim.js's board line named "LED L",
  the Arduino's, for every microcontroller. It now names the board's LED by its pin (an Arduino's "LED L", a Pico's
  "LED (GP25)"), and an ESP32 DevKitC's line its pins only.
