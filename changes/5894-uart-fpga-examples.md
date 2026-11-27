In short:

- The System examples uart-pic24, uart-pico and uart-esp32 are now uart-fpga-pic24, uart-fpga-pico and uart-fpga-esp32
  (the uart example's FPGA with a microcontroller); their old names, in a link too, still open them (#5894).

In detail:

- **The System examples renamed (#5894):** their folders and their System documents (`uart_fpga_<board>.sys.json`),
  the short names left for the processor boards' own uart examples (#5874). `core/examples.js` `exampleName` maps an
  old name to the new one while no example has it: New Project's and the browser edition's stores, the MCP's
  `new_project_from_example` and `open_link`, and a link `#open=example:…` take it.
