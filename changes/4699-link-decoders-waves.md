In detail:

- **Co-design's link decoders and the system's waves (#4699, roadmap #4695):** `core/system-decode.js` decodes a link's
  traffic from the pins the co-simulation scheduler exchanges: a UART's bytes at its baud and frame (data bits 5 to 8,
  parity N, E or O, stop bits 1 or 2), each at its start bit's time, with a framing error and a parity error as
  warnings (a wrong baud gives garbage, as on a real board). `core/system-waves.js` makes one set of waves for the whole
  system, a scope per node with its linked pins and a scope `links` with each link's named signal (`uart_avr_tx`), in
  the simulator's shape (the waveform viewer's) and as a VCD (the simulator's `toVCD`). `core/vcd.js` reads a VCD back
  (its scopes, signals and changes). The System's simulation view (#4701) and the MCP's `simulate_system` (#4702) show
  them.
