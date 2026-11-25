In detail:

- **The System's node contract and its link kinds as types (part of #5485):** `core/system-ports.js`, a node's typed
  ports (a direction: in, out, inout; a kind: pin, transaction, memory, analog, message; an electrical level in volts,
  3.3 V or 5 V, for #5498's check; a width, a bus's protocol and role); `core/system-links.js`, the link kinds (a digital
  pin, a transaction bus: UART, SPI, I²C, 1-Wire, CAN; a memory-mapped bus: AXI-Lite, AXI-Stream; an analog signal; a
  network: Wi-Fi, MQTT, BLE), the port kinds each joins, each protocol's lookahead (the scheduler's latencies: a UART's
  sixteenth of a bit, SPI's and I²C's of a clock period, a wire's 1 µs) and the ends' check; `core/system-contract.js`,
  the contract (`run(t1, inputEvents)` returning the outputs' events with their times, the ports, `save` / `restore`,
  the lookahead, the fidelity notes for #5499), `ContractNode` (an engine behind it, its state its inputs, restored by
  replaying them on a new engine), `StimulusNode` (a node's test bench). Tests: system-contract.
