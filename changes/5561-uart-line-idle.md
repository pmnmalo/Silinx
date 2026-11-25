In short:

- **A System's serial line at rest:** an Arduino sketch's Serial, compiled by Compile Firmware, is now echoed by the
  FPGA byte for byte. The FPGA no longer misreads the line while the Arduino starts up.

In detail:

- **A UART link's line rests high while its transmitter is not enabled yet (#5561):** a UART link takes 1 when its source
  floats (`core/system-build.js`), as an SPI's SS and I²C's lines already did (#5214). An AVR's D1 is an input until the
  USART is enabled: about 100 µs for an Arduino sketch, while its core starts up before `Serial.begin`. During that
  time the FPGA's `rx` was X, its receiver saw a false start bit, missed the first byte and misread the bytes after it.
  Tests, both failing on the old code: mcp-system (an AVR that enables its USART after about 0.5 ms, echoed byte for
  byte; `echoProgram`'s `wait`, test/avr-asm.mjs); avr-compile-server (uart-avr's `hello.ino` compiled by the real
  arduino-cli, when installed, its `"hello 0\r\n"` echoed by the FPGA, no warning).
