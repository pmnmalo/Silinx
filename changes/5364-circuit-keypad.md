In short:

- **A 4×4 keypad in the Circuit editor:** a membrane keypad with 16 keys, each pressed while the mouse holds it down in
  Try it, in the System Emulator and by the MCP. An Arduino or an FPGA scans it through a System's circuit node.

In detail:

- **A 4×4 matrix keypad as a circuit's part (#5364, part of #3902; co-design's peripherals):**
  - **The part** (`core/circuit-keypad.js`): its ribbon's 8 pins (R1..R4, C1..C4) and its 16 keys (1 2 3 A / 4 5 6 B /
    7 8 9 C / * 0 # D). Each key is a momentary contact joining its row to its column, simulated as a button's (two keys
    at once, and a real keypad's ghosting).
  - **The HDL:** each key is an input (KP1_1 … KP1_star, KP1_hash, KP1_D), compiled, elaborated and simulated in VHDL and
    in Verilog.
  - **Its checks:** a 74LS input on a column floats while no key is pressed; a short while a key is pressed. Its Part
    info, in English and Portuguese.
  - **The drawing** (`web/js/circuit-draw-keypad.js`): its keys (the letters red, * and # blue), each held while the
    mouse is down in Try it and drawn down then. The editor's press carries the key's index.
  - **Where its keys are pressed:** in the System Emulator (`KP1:1` … `KP1:16`), and by the MCP (`simulate_drawing`'s
    steps by port, `simulate`'s controls by pin).
  - **Outside the circuit:** it is listed in the Parts panel's Inputs and in `circuit_parts`, and kept out of the KiCad
    export (KiCad has its own).
  - **Tests:** circuit-keypad (the contacts, the ghost, the checks, the HDL, an Arduino scanning it through a circuit
    node and the System Emulator's pins), mcp-circuit, and the UI's circuit-keypad (both interfaces, Portuguese).
