In detail:

- **The UI test of New Project's Start from list (#5282):** `test/ui/test-designs.test.js` expects the co-design
  examples too, disabled in an FPGA project's kind (uart-avr, spi-avr: `CODESIGN_ORDER`), in English and Portuguese; it
  failed on main since the uart-avr example.
