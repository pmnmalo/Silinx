# Digital circuits on a breadboard

A circuit is a drawing of real integrated circuits (74xx TTL, 4000 CMOS), switches, buttons, LEDs and displays, wired
on breadboards or without one, as a student builds it on the bench, and simulated live: a click on a switch, and the
LEDs show what the chips do. It is **digital only**: a wire carries a logic level, never a voltage or a current; there are no
resistors and no capacitors, and the power supply is a pair of logic levels (VCC is 1, GND is 0). Wokwi, Tinkercad
Circuits and Java Breadboard inspired it; its look, its parts' drawings and its format are Silinx's own.

The umbrella issue is #3897; each phase has an issue of its own (#3898 to #3902).

## The document

- A circuit is one file, `<name>.circ.json`, a design source of any project: an FPGA project or a design and
  simulation project (no new project kind). New Source ▸ **Circuit** makes one, empty or with a breadboard and a power
  supply.
- **It is a module**, as every Silinx drawing: its **logic switches** and **buttons** are its inputs, its **LEDs** (and,
  later, displays) its outputs, named by their labels; its HDL file is generated from it (below). The Design pane shows
  its row as every drawing's: `[Circuit]` first (it opens the drawing), `[VHDL]` / `[Verilog]` last (hidden in a design
  project).
- **The canvas** is a grid of 0.1 inch steps (the breadboard's pitch): every pin, hole and wire end is on a grid point.
  A part is placed on a breadboard or anywhere beside it; nothing needs a breadboard.
- **Connectivity is geometric**, as on the bench: a pin that lands on a breadboard's hole is in that hole; a wire's end
  joins the hole, the pin or the other wires' ends on its point. Two wires that cross without an end in common are not
  joined.
- **The editor** (`web/js/circuit-editor.js` and its `circuit-*.js` modules) follows docs/UI-GUIDELINES.md, as the Petri
  net's: the toolbar (select, wire, rotate, delete, then the zoom, then Check and Try it, Reset while trying it; printed
  by the main toolbar's Print), the Properties side panel on the right, foldable, over the canvas behind ☰ Properties on a
  narrow screen: the parts library (by category: a click on a part, then on the drawing), the selected part's label,
  colour and pinout, the circuit's name and HDL language; the status line (its counts: "2 IC(s) · 2 switch(es) · 2 LED(s)
  · 15 wire(s)"; while simulating, "t = 24 ns"); every message in the console.

## The parts library

Each part is a description in `core/circuit-parts*.js`: its pins (number, name, direction: in, out, power, passive),
its body's drawing, its logic and its timing. One description serves the editor, the simulation, the checks, the
generated HDL and the MCP server.

| Category | Parts | Phase |
|---|---|---|
| Breadboards | half (30 columns, 400 holes), full (63 columns, 830 holes); two power rails on each side | 1 (half), 2 (full) |
| Power | supply (+5 V and GND terminals: logic 1 and 0) | 1 |
| Inputs | logic switch (a slide switch giving 0 or 1, as a trainer kit's), push button (SPST, momentary) | 1 |
| | SPDT switch, DIP switch (4 / 8), pull-up and pull-down (weak 1 / weak 0), clock source (a frequency, a duty cycle) | 2 |
| Outputs | LED (anode, cathode; its colour) | 1 |
| | 7-segment display (common cathode and common anode, with its point), LED bar (10) | 2 |
| Gates (74xx, as the 74LS) | 7400 NAND, 7404 NOT, 7408 AND, 7432 OR, 7486 XOR | 1 |
| | 7402 NOR, 7410 / 7411 / 7420 / 7427 / 7430 (3, 4, 8 inputs), 7414 (Schmitt NOT), 7401 / 7403 / 7405 / 7406 (open collector) | 2 |
| Gates (4000) | 4001, 4011, 4030 / 4070, 4069, 4071, 4081 | 2 |
| MSI | 7447 / 7448, 4511 (BCD to 7 segments), 74138 / 74139 (decoders), 74151 / 74153 / 74157 (multiplexers), 7483 / 74283 (adders), 7485 (comparator) | 3 |
| Sequential | 7474, 7476, 74112 (flip-flops), 7490 / 7493 / 74161 / 74163 / 74191 / 74193 (counters), 74164 / 74165 / 74194 / 74595 (shift registers), 4017 | 3 |

**Real pinouts:** a 14-pin DIP's pin 1 is at its lower left with its notch on the left, pins 1 to 7 left to right
along its lower row, 8 to 14 right to left along its upper row, VCC on 14 and GND on 7 (the 7400 family's; each part
says its own). The 7400, 7408, 7432 and 7486 share one pinout (1A 1, 1B 2, 1Y 3, 2A 4, 2B 5, 2Y 6, 3Y 8, 3A 9, 3B 10,
4Y 11, 4A 12, 4B 13); the 7404's six inverters are 1A 1, 1Y 2, …, 4Y 8, 4A 9, 5Y 10, 5A 11, 6Y 12, 6A 13. The 7402's
outputs come first (1Y 1, 1A 2, 1B 3, …). Each part's pinout is shown in its Properties and on hover over a pin.

**Timing:** a part has its typical propagation delay (the 74LS datasheets': 7400, 7404, 7408: 10 ns; 7486: 12 ns;
7432: 14 ns), one value for both edges. The delays are inertial (a pulse shorter than the delay does not get through),
as VHDL's `after` and Verilog's `#` on a continuous assignment, so the live simulation and the generated HDL agree.

## The wiring

- **A wire** goes from a grid point to a grid point, with bends; its colour is the student's (red, black, and others).
  The Wire tool draws it point by point (a click on each bend, a double click or a click on a pin or hole to end it).
- **A breadboard's strips:** each column's five holes a–e are one strip, its five holes f–j another; the channel
  between e and f separates them, and a DIP IC straddles it. Each power rail (top +, top −, bottom +, bottom −) is one
  strip along its length (a full breadboard's rails split in the middle, as many real ones: phase 2).
- **The nets:** the strips, the wires and the pins on the same point are joined into nets (`core/circuit-net.js`). A
  closed switch or a pressed button joins its two nets while closed.

## The simulation

- **The engine** (`core/circuit-sim.js`) is an event-driven simulation of the nets with the parts' delays, in
  nanoseconds. Each net's level is resolved from its drivers by strength: a strong 0 or 1 (an output, the supply, a
  logic switch), a weak 0 or 1 (a pull-up or pull-down, phase 2), or nothing (Z). Two strong drivers of opposite levels
  are a short circuit: the net is X.
- **An IC reads its inputs as the real one:** a floating 74LS input reads high, a floating 4000 input reads X.
- **At power-on** every IC's output is unknown (X) until its inputs make it known, as in the generated HDL: a latch is X
  until it is set or reset, and a ring of inverters with no gate stays X (a gated one, a NAND enabled by a switch,
  starts from a known level and oscillates once enabled).
- **An IC is powered** when its VCC pin's net is 1 and its GND pin's net is 0; an unpowered IC drives nothing (its
  outputs float).
- **Live:** Try it starts it; a click on a logic switch flips it, a press on a button holds it while pressed (a long
  press on a touch screen); the simulation runs until the circuit is quiet. The LEDs light, each pin and wire is
  coloured by its level (0, 1, Z, X), the status line says the simulated time. A circuit still changing after 1 µs of
  simulated time (a ring oscillator, a latch's race) is said to oscillate, in the console, its oscillating nets marked.
- **SSim:** the generated HDL is simulated as any module's (its test bench, the waveforms); the unit tests check that
  the live engine and the HDL simulated by Silinx agree.

## The checks

A circuit's Check (and every change, as the other drawings') says in the console, a click on a message selecting the
part or wire:

- **errors:** a short circuit (two outputs, or the supply's two terminals, driving opposite levels on one net: the parts
  named); an IC not powered or powered the wrong way (its VCC and GND pins' nets); an output driving a supply rail; two
  parts on the same holes; a label used twice or not a valid HDL name;
- **warnings:** an IC input floating (and what it reads: "U1 pin 1 (1A) is floating: a 74LS input reads high"); an LED
  that can never light (its anode and cathode on the same net, or reversed between the rails); a part or a wire end
  that joins nothing; an IC whose gates are partly unused is not warned (their inputs unwired are the bench's habit),
  but their outputs are left out of the HDL.

## The generated HDL

The circuit's HDL file (VHDL or Verilog, the circuit's language) is one module named after the circuit:

- its ports: an input per logic switch and button (`'1'` while on or pressed), an output per LED (`'1'` while lit);
- its nets: one signal each (`std_logic`, resolved, in VHDL; a `wire` in Verilog), the supply's as constants;
- each IC an instance of its own entity, written in the same file and named after the circuit (`<circuit>_sn74ls00`,
  so that two circuits of a project never define the same entity), its gates with their delays and its inputs read as
  the real chip reads them (`'Z'` as `'1'` for a 74LS);
- a switch or button: an assignment driving its net from the supply's side while closed, `'Z'` while open; one that
  joins two nets neither of which is the supply's cannot be written as HDL: an error of the HDL's generation;
- an LED: its output is `anode = '1' and cathode = '0'`.

It is regenerated as every drawing's (on save, after an edit through the MCP server), with its header "generated from
…, do not edit". The HDL does not flow back into the circuit.

## The MCP server

What the interface does, the MCP server does (CLAUDE.md, #2674):

- `new_source` type `circuit` (empty, or with a breadboard and a supply);
- `circuit_parts`: the library, a part's pins, its logic and delay;
- `edit_circuit`: operations on a circuit: add a part (on a breadboard's hole, `bb1.f10`, or at a grid point), move,
  rotate, delete, wire two points (holes, pins `U1.3`, `S1.out`, grid points), set a part's label or colour;
- `check_drawing`: the circuit's check (its errors and warnings, as the console's);
- `simulate_drawing`: a sequence of steps, each setting switches and buttons and running until quiet (or a given time),
  answering the LEDs, the nets asked for, the time and the warnings (a short, an oscillation);
- `read_file` / `write_file` for the JSON itself, the HDL regenerated after a write.

## The file format

```json
{
  "format": "silinx-circuit", "version": 1,
  "name": "half_adder", "lang": "vhdl",
  "parts": [
    { "id": "bb1", "type": "breadboard-half", "x": 0, "y": 0 },
    { "id": "P1", "type": "supply", "x": -6, "y": 2 },
    { "id": "U1", "type": "7486", "x": 10, "y": 13, "rot": 0 },
    { "id": "S1", "type": "logic-switch", "x": -4, "y": 20, "label": "a", "on": false },
    { "id": "D1", "type": "led", "x": 30, "y": 4, "rot": 90, "label": "s", "color": "red" }
  ],
  "wires": [
    { "id": "w1", "points": [[-4, 18], [-4, 16], [10, 16]], "color": "yellow" }
  ],
  "generatedFile": "src/half_adder.vhd"
}
```

Coordinates are grid steps (0.1 inch). A part's `x`, `y` is its pin 1's point (a breadboard's: its hole a1's), `rot` its
quarter turns; the part's other pins follow from its description. `on` is a switch's position as saved (the simulation
starts there). The file is plain JSON, merged by Silinx's drawing merge as the other drawings (by its parts and wires).

## The phases

1. **The first slice** (#3898): first the model, the simulation, the checks, the HDL and the MCP tools (`core/circuit*.js`,
   `server/mcp-circuit.js`), then the document and its editor (a followed shared project shows it read-only; its live
   editing in a shared project is phase 4), the half breadboard, the supply, the logic switch and the push
   button, the LED, the 7400, 7404, 7408, 7432 and 7486; the nets, the checks, the live simulation with delays, the
   generated HDL (VHDL and Verilog), the Design pane's row, New Source, the MCP tools; Portuguese.
2. **More parts:** the full breadboard, the SPDT and DIP switches, pull-up and pull-down, the clock source (a
   simulation in real time, slowed), 7-segment displays and the LED bar, the other 74xx gates, open collector outputs,
   the 4000 gates.
3. **MSI and sequential ICs:** decoders, multiplexers, adders, comparators, flip-flops, counters, shift registers; a
   logic probe; the nets' waveforms (SSim on the generated HDL from the circuit's toolbar).
4. **The circuit in the rest of Silinx:** a circuit as an FPGA project's top (its switches and LEDs on the board's),
   with an example; Convert to Schematic (the ICs as symbols); edited live in a shared project, its git merge; labs and
   grading; print and export as SVG.
5. **Sensors, actuators and displays** (digital interfaces, each with its protocol simulated): a rotary encoder, a
   keypad matrix, a buzzer, a servo (PWM), a stepper and its driver, an ultrasonic range sensor, a PIR sensor, a
   temperature and humidity sensor, a character LCD (HD44780, parallel), a graphic OLED (I²C / SPI), an SD card (SPI).
