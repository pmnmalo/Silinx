In detail:

- **The Systems' benchmark with a microcontroller node (#5912):** `scripts/bench-system-sim.mjs --b avr` runs node b as
  an Arduino Uno's echo program (avr8js, 16 MHz, its USART at the UBRR nearest the baud rate, its own rate said) on its
  D1 / D0, instead of stopping with "comes with #4698"; the two nodes alone measured the same way. A test runs it.
