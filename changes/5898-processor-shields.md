In short:

- Shields: an Arduino's, a Raspberry Pi Pico's or an ESP32's Board project can have a circuit around its board, with
  the buttons, switches, displays and LEDs it lacks (its row's Add Shield); Emulate Node runs the board with it. The
  Pico and Pico W are parts of the Circuit editor too (#5898).

In detail:

- **A processor board's shield (#5898):** the board's row's Add Shield (and the MCP's `edit_system` `add_shield`) writes
  `shield/shield.circ.json`, a half breadboard with its supply and the board's part labelled with its node, and adds it
  to the project's System as its circuit node; the project stays a Board project, the Design pane's top row the board,
  the shield's row under it; Emulate Node and Simulate Node run the board with its shield; Project ▸ Change Mode keeps it
  both ways. The Explorer 16/32 has none (its own buttons and display). `core/processor-shield.js`.
- **The Raspberry Pi Pico and Pico W as the Circuit editor's parts (#5898):** DIP-40s across a breadboard's channel,
  drawn as the real boards (`web/js/emulator-pico.js`: the castellated pads, the micro-USB, BOOTSEL, the LED, the RP2040,
  the Pico W's wireless module), their pins the RP2040 node's.
- **An ESP32 or a Pico in a circuit node (#5903):** the System's check took a circuit's Arduino part only as a
  microcontroller's board, and refused an ESP32 DevKitC's (`core/system-circuit.js`): every processor board's part is
  its node's board now, its pins both ways.
