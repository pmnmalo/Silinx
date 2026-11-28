In short:

- The JTAG port: on in an erased FICD, it takes RA0, RA1, RA4 and RA5 (the Explorer 16/32's LEDs D3, D4, D7, D8) as
  on the device; `config __FICD, JTAGEN_OFF` gives them back. The assembler's configuration words now reach the
  device (`config __FWDT, FWDTEN_OFF` turns the watchdog off).

In detail:

- **FICD's JTAGEN (#6027, register 30-10):** `readConfig` gives `jtag`, and the ports (`gpio.js`) drive none of TMS
  (RA0), TCK (RA1), TDI (RA4) and TDO (RA5) while it is on (no debugger shifting TDO), a warning the first time the
  program makes one an output. The assembler takes `config __FICD, JTAGEN_OFF` and `JTAGEN_ON` (`CONFIG_SETTINGS`).
- **The configuration words in `assembleProgram`'s .hex (#6037):** each was written at half its program address
  (`writeHex`'s base is the program address), so the device read them as erased; they are now at their addresses
  (FWDT at the HEX's byte 0x157E40, as XC16 writes it).
