In short:

- **The Explorer 16/32's D10 follows RA7:** in Emulate and the MCP's `simulate`, D10 no longer shows lit while S5 holds
  RA7 low in a program that reads S5 there.

In detail:

- **D10 follows RA7's level while the PIC24 reads it (#5880):** D10 and S5 share RA7; the System Emulator lit an LED from
  what the PIC24 drove on its pin (the watched trace), so with RA7 an input S5's press never reached D10, left lit by its
  last level. An LED whose pin the PIC24 does not drive now follows the pin's level (core/system-emu-explorer.js
  explorerState): off while S5 holds it at 0, lit by its pull-up once let go; the LEDs the PIC24 drives as before.
