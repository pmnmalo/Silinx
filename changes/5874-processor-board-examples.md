In short:

- Examples for every Board Type: an Arduino, the Explorer 16/32 (PIC24), a Raspberry Pi Pico and an ESP32 alone now each
  have their own examples in New Project ▸ Board ▸ Start from: an LED blinking, a counter, the PIC24's buttons and its
  potentiometer, the Pico's console echo (#5874).

In detail:

- **The processor boards' examples (#5874):** blinky-arduino and counter-arduino (Arduino sketches, their `.hex`
  shipped), blinky-pic24, buttons-pic24, counter-pic24 and adc-pic24 (assembly for the Explorer 16/32: D3 blinking, S3..S6
  lighting their LEDs, a counter on the LEDs and the LCD, R6 as a bar on the LEDs), blinky-pico, counter-pico and
  echo-pico (MicroPython, each saying what it does in its console; the echo's stimulus file types a line for Simulate),
  blinky-esp32 and counter-esp32 (MicroPython). New Project's Start from lists the examples of the Board Type chosen, and
  an example is made on any board of its type (an Arduino's on the Uno or the Nano, a Pico's on the Pico or the Pico W),
  its program opened. The MCP's `list_examples` gives each example's Board Type and lists only those of a `mode` and a
  `board_type`; `new_project_from_example` makes a processor board's example, on another board of its type with `board`.
  Each example is checked, run and emulated by `test/processor-examples.test.js` (its behaviour and no warning), and made
  in New Project by `test/ui/processor-examples.test.js`.
