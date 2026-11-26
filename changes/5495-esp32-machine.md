In short:

- **The ESP32's Timer, PWM, ADC, SPI and I²C:** an ESP32's MicroPython program can use `machine.Timer`, `PWM`, `ADC`,
  `SPI` / `SoftSPI` and `I2C` / `SoftI2C`; its SPI and I²C buses link to an FPGA's (**+ SPI**, **+ I²C** in its
  Properties), which answers it as it answers an Arduino.
- **The uart-esp32 example:** an ESP32 and a Basys2 over UART, the ESP32's hello echoed by the FPGA into its console.

In detail:

- **The ESP32 node's machine (#5495):** `core/esp32-python.js` adds Timer (its callback between two lines of the program
  once its time has come, or during a sleep at its time), PWM (its pin's edges at its period and duty, a new duty from
  its time), ADC (its pin's logic level, 0 or full scale), SPI and I2C masters (hardware ids on their default pins, the
  Soft ones on any): each step becomes its pins' waveforms (`core/esp32-buses.js`), the program waits for its end, and
  what it reads is read by the node from the levels the other end gave at each sampling edge; an address no one
  acknowledges raises `OSError` ENODEV. The engine's bridge (`core/esp32-engine.js`) gives each step's time to both
  sides. The board's buses: SPI1, SPI2, I2C0, I2C1 (`core/system-doc.js`); an interface added with no name takes the
  board's next one (`addInterface`, so the System editor's **+ SPI** / **+ I²C** and the MCP's `edit_system`). Its
  fidelity notes say what is behavioural.
- **Fewer round trips to an ESP32's engine (#5495):** the node asks its engine for nothing while the program sleeps or
  waits for a bus step past the window, or has ended with nothing typed; the same run (its inputs applied at their times
  at the next command), an I²C run at 100 kHz in a second instead of a minute.
- **The System example uart-esp32 (#5495):** the ESP32's `esp/main.py` sends "Hello from ESP32!" over UART(2) at 9600
  baud and prints what comes back; the FPGA's module the uart-avr example's; listed after the other System examples, in
  New Project and the MCP's `list_examples`. docs/SYSTEMS.md, the user guide.
