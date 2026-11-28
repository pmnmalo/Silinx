In short:

- **MicroPython on the Pico and the ESP32 reads its outputs back:** `led.value()` of an output pin is the level it
  drives, as on the boards, so `led.value(not led.value())` toggles it.
- **`input()` on the ESP32:** it reads a line typed into its console, as on the board, instead of stalling for 30 s.

In detail:

- **An output pin's `value()` its level (#5881):** the ESP32's behavioural `machine.Pin` read an output's level from
  outside, so it was always 0. It now reads back what it drives, and a released open drain reads the line's level
  (core/esp32-engine.js). On the Pico, rp2040js fed GPIO_IN with the level from outside only, so MicroPython read 0 after
  `toggle()`. While a pin drives, its input now reads its own level, as the RP2040's pad does (core/system-sim-rp2040.js).
- **`input()` on the ESP32 reads its console (#5884):** its MicroPython had no console input, so `input()` blocked its
  Worker until Simulate stopped it after 30 s. `input()` now reads the next line typed into its REPL's console and
  echoes it, its time passing while it waits, on JSPI and in a Worker (core/esp32-python.js, core/esp32-engine.js).
