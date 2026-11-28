In short:

- A new ESP32 Board project's starter program blinks GPIO2 again instead of stopping with an error (#5875).

In detail:

- **The ESP32's starter blinks (#5875):** a new Board project on the ESP32 DevKitC started with a `main.py` that called
  `Pin.toggle()`, which the ESP32's MicroPython has not: its run stopped at once with an AttributeError. The program now
  keeps the LED's level itself (`on = not on`, `led.value(on)`), and GPIO2 blinks.
