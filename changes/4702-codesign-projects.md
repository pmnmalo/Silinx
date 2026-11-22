In short:

- **Co-design projects:** New Project ▸ Co-design makes a project of FPGA and microcontroller nodes linked in a
  System, empty or from the new example uart-avr (an Arduino Uno and the uart example's FPGA linked by UART), drawn in
  the System editor and simulated together (Simulate: the link inspector's bytes, a terminal, the waves).

In detail:

- **Co-design projects made by New Project (#4702):** its Co-design card is enabled: a co-design project has no board
  of its own (its settings page says why), its System document `<name>.sys.json` is made with it and opened; its Start
  from is Empty or a co-design example, the FPGA kind's has none (core/project-kind.js createRefusal, boardRefusal: the
  server's and the browser edition's stores, one rule). Design Properties of a co-design project says what stands for
  its board. The MCP server's `new_project` makes one (kind codesign: its System, no board). The example `uart-avr`: the
  uart example's FPGA module (the same sources), an Arduino Uno's firmware (`firmware/hello.asm` and its `.hex`: it sends
  "Hello from Arduino!", the FPGA echoes it) and their System. The user's guide has a page on co-design, in English and
  in Portuguese.
