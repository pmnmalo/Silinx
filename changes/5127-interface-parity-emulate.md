In detail:

- **The interfaces' parity test and the ISE style toolbar's Emulate Behavioral Model (#5127):**
  `test/ui/interface-parity.test.js` (#2450) takes the toolbar's Emulate Behavioral Model (#5114) for what it is,
  Processes ▸ Emulate on Board ▸ Emulate Behavioral Model (RTL) named without its "(RTL)", which both interfaces have.
  The New ASM State Diagram toolbar button is gone (#5114), so its entry is gone too.
