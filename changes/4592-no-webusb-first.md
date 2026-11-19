In short:

- **Programming in Firefox or Safari:** the browser edition says first that this browser cannot program a board (it has
  no WebUSB: Chrome or Edge do), then, for an imported project, that it must be trusted, with its Trust Project button;
  it no longer offers to implement the design or asks about pins before saying so.

In detail:

- **A browser with no WebUSB said first (#4592):** the browser edition's Program FPGA, the PROM's operations and an open
  family's Program, in a browser with no WebUSB (Firefox, Safari, an iPad or iPhone): its reason first, then an
  untrusted project's refusal with its Trust Project button; a trusted project gets the reason at once, without the
  questions asked before programming (implement the design first, the pins, writing the SPI flash) or a missing
  bitstream's message.
