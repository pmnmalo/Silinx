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
- **Moving and turning** (#4059, #4065): a breadboard moved or turned carries the parts plugged into it (a pin in one of
  its holes) and the wires between them; with **Keep connections** (the toolbar's, as the schematic's: remembered, on by
  default) the ends of the other wires on the moved pins and holes follow them, not ticked they stay where they are. Every
  part turns a quarter clockwise (R), a breadboard too, drawn turned whole with its labels upright (#4114); there is no mirror. **Cut, Copy and Paste** (#4066) copy the
  selected part (a breadboard with the parts on it and the wires between them), pasted 2 steps right and down, new ids
  given, a label another part has left out.
- **Show inside** (#4060, the toolbar's, remembered): each breadboard's strips drawn under its holes (each column's a–e
  and f–j, each power rail), each gate IC's gates in its body (IEC boxes, &, ≥1, =1, 1, a bubble on an inverting one)
  joined to its pins, another IC's pins named inside it, so that a circuit is easier to wire.
- **How the wires are drawn** (#4064, the ⋮ menu, as the schematic's): **Curved wires** (the circuit's `wireStyle`,
  saved with it: each wire a smooth curve through its bends, as a jumper wire) and **Wire crossings** (#4101, a
  choice as the schematic's, remembered): **Hop-overs** (the default: a small arc where a wire crosses one drawn before
  it without joining it) or **Plain crossings** (the wires straight across each other); `core/circuit-wires.js`. The look
  only: the connections are the same.
- **The editor** (`web/js/circuit-editor.js` and its `circuit-*.js` modules) follows docs/UI-GUIDELINES.md, as the Petri
  net's: the toolbar (select, wire, rotate, delete, then the zoom, Keep connections, then Check and Try it; while trying it, the Try it bar above the canvas, as the schematic's, its Reset and Stop, #4067; printed
  by the main toolbar's Print), the Properties side panel on the right, foldable, over the canvas behind ☰ Properties on a
  narrow screen: the selected part's label, colour, pinout, a switch's position as saved (a DIP switch's levers), a
  clock's frequency; the parts library (by category: breadboards, power, inputs, outputs, the 74LS and the 4000 gates; a
  click on a part, then on the drawing); the circuit's name and HDL language; the status line (its counts: "2 IC(s) · 2 switch(es) · 2 LED(s)
  · 15 wire(s)"; while simulating, "t = 24 ns"); every message in the console.

## The parts library

Each part is a description in `core/circuit-parts.js` (the ICs' tables: `core/circuit-ics.js`): its pins (number, name,
direction: in, out, open collector, power, passive, weak, not connected), its inputs (a level, a momentary button, a
clock), its contacts (two pins joined while an input is on or off), its pulls, its lamps (an anode and a cathode), its
logic and its timing. One description serves the editor, the simulation, the checks, the
generated HDL and the MCP server.

| Category | Parts | Phase |
|---|---|---|
| Breadboards | half (30 columns, 400 holes), full (63 columns, 830 holes); two power rails on each side | 1 (half), 2 (full) |
| Power | supply (+5 V and GND terminals: logic 1 and 0) | 1 |
| Inputs | logic switch (a slide switch giving 0 or 1, as a trainer kit's), push button (SPST, momentary) | 1 |
| | SPDT slide switch (break before make), DIP switch (4 / 8), pull-up and pull-down (weak 1 / weak 0), clock source (its frequency, 0.1 to 50 Hz, ticking in real time) | 2 |
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

Every 4000 quad 2-input gate shares the 4001's pinout (1A 1, 1B 2, 1Y 3, 2Y 4, 2A 5, 2B 6, VSS 7, 3A 8, 3B 9, 3Y 10, 4Y 11,
4A 12, 4B 13, VDD 14), not the 7400's. The 7410, 7411 and 7427: 1A 1, 1B 2, 2A 3, 2B 4, 2C 5, 2Y 6, 3Y 8, 3A 9, 3B 10,
3C 11, 1Y 12, 1C 13; the 7420's pins 3 and 11 and the 7430's 9, 10 and 13 are not connected. A 7-segment display's pins
are e 1, d 2, COM 3, c 4, DP 5, b 6, a 7, COM 8, f 9, g 10 (its two commons joined inside), its rows 0.6 inch apart; an
LED bar's anodes are 1 to 10 and its cathodes 20 to 11.

**The MSI ICs** (`core/circuit-msi.js`) are described by their pins (an active low pin's name barred, as its datasheet's,
its port `<name>_n`), a model (its outputs from its inputs) and their HDL bodies, written into one wrapper (the inputs read
as a 74LS reads them, an unknown input making every output X, the outputs after the IC's delay, open collector ones a 0
or nothing). The 7447 drives a common anode display (open collector, active low), the 7448 a common cathode one (its
outputs modelled as totem pole, its pull-ups inside); their BI̅/RBO̅ pin is an input (BI̅), RBO̅ not modelled. The 7483's
VCC is pin 5 and its GND pin 12.

**The sequential ICs** (`core/circuit-seq.js`: the 7474, 7476, 74112, 7490, 7493, 74161, 74163, 74191, 74193, 74164,
74165, 74194, 74595, 4511 and 4017) are written three times the same way, in the clocked style a synthesis tool reads: the
engine's processes, each run when an input of its sensitivity changes (an asynchronous control first, else its clock's
edge, from 0 to 1 or 1 to 0), and their VHDL processes and Verilog always blocks; their registers are unknown (X) at
power-on, until a clear, a load or a clock makes them known. Two choices of that style, said here: an asynchronous load
(the 74165's SH/LD̅, the 74191's and the 74193's LOAD̅) takes the inputs when it starts, not while it is held (the chips
follow them); releasing one of two asynchronous controls both active (a 7474's PRE̅ and CLR̅, the 7490's R0 and R9, the
74193's CLR and LOAD̅: not stable on the chips) is seen by VHDL and the engine, not by Verilog's edges. The 74193 counts
on the rising edge of UP and DOWN ANDed, up when UP was the last to fall; the 4017 on CLK's rising edge only (not on CLK
INH's falling edge). Their generated HDL is clean of Check Syntax's warnings, the few the chips' own structure raises (a
clock read through the IC's input, a latch, a clock used as data) silenced with their reason (`silinx: ignore`).

**Timing:** a part has its typical propagation delay (the 74LS datasheets': 7400, 7402, 7404, 7408, 7410, 7411, 7420,
7427: 10 ns; 7430, 7486: 12 ns; 7432: 14 ns; 7414, 7406: 15 ns; the open collector 7401, 7403, 7405: 17 ns; the 4000s
at 5 V: 4069 45 ns, 4001, 4011, 4071, 4081 60 ns, 4030 100 ns, 4070 140 ns), one value for both edges. The delays are inertial (a pulse shorter than the delay does not get through),
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
- **Open collector outputs** drive a 0 or nothing: several on one net are a wired AND, which a pull-up makes 1 while
  they are all off (with none, the check warns: the net floats).
- **Contacts:** a button, a slide switch (its common to A while off, to B while on) and a DIP switch's levers join two
  nets while closed.
- **The clock source** is an input like a switch, which Try it flips in real time at its frequency (0.1 to 50 Hz): the
  gates' nanoseconds settle between its ticks.
- **At power-on** every IC's output is unknown (X) until its inputs make it known, as in the generated HDL: a latch is X
  until it is set or reset, and a ring of inverters with no gate stays X (a gated one, a NAND enabled by a switch,
  starts from a known level and oscillates once enabled).
- **An IC is powered** when its VCC pin's net is 1 and its GND pin's net is 0; an unpowered IC drives nothing (its
  outputs float).
- **Live:** Try it starts it (its bar's Reset starts it again from time 0, its Stop or Esc ends it); a click on a logic switch flips it, a press on a button holds it while pressed (a long
  press on a touch screen); the simulation runs until the circuit is quiet. The LEDs light, each pin and wire is
  coloured by its level (0, 1, Z, X), the status line says the simulated time. A circuit still changing after 1 µs of
  simulated time (a ring oscillator, a latch's race) is said to oscillate, in the console, its oscillating nets marked.
- **The logic probe** shows its tip's level while trying it (H, L, open, X); it is no port of the HDL, but the net it
  watches is a signal of it (one only a probe watches declared with its reason, no warning).
- **The waveforms** (#4068) are those of the circuit's simulation, as every module's: Simulate of a test bench of the
  circuit (the Test Bench Wizard's, or one written by hand) in SSim; the editor has no waveforms of its own.
- **SSim:** the generated HDL is simulated as any module's (its test bench, the waveforms); the unit tests check that
  the live engine and the HDL simulated by Silinx agree.

## The checks

A circuit's Check (and every change, as the other drawings') says in the console, a click on a message selecting the
part or wire:

- **errors:** a short circuit (two outputs, or the supply's two terminals, driving opposite levels on one net: the parts
  named; an open collector output with a totem pole one, or on the + rail; a contact joining the supply's + and − while
  closed); an IC not powered or powered the wrong way (its VCC and GND pins' nets); an output driving a supply rail; two
  parts on the same holes; a label used twice or not a valid HDL name;
- **warnings:** an IC input floating (and what it reads: "U1 pin 1 (1A) is floating: a 74LS input reads high", "… a
  CMOS input reads X"; or while a contact is open: "floats while S1 is off"); an open collector output with no pull-up;
  an LED that can never light (its anode and cathode on the same net, or reversed between the rails), a display's
  common on the wrong rail; a part or a wire end
  that joins nothing; an IC whose gates are partly unused is not warned (their inputs unwired are the bench's habit),
  but their outputs are left out of the HDL.

## The generated HDL

The circuit's HDL file (VHDL or Verilog, the circuit's language) is one module named after the circuit:

- its ports: an input per logic switch, slide switch, button and clock (`'1'` while on, pressed or high), per DIP switch's
  lever (`<label>_1` …); an output per LED, per display's segment (`<label>_a` … `<label>_g`, `<label>_dp`) and per LED
  bar's light (`<label>_1` …), `'1'` while lit;
- its nets: one signal each (`std_logic`, resolved, in VHDL; a `wire` in Verilog), the supply's as constants;
- each IC an instance of its own entity, written in the same file and named after the circuit (`<circuit>_sn74ls00`,
  so that two circuits of a project never define the same entity), its gates with their delays and its inputs read as
  the real chip reads them (`'Z'` as `'1'` for a 74LS);
- a contact (a button, a slide switch, a DIP lever): an assignment copying its strongly driven side's net to its other
  side while closed, `'Z'` while open; one between two strongly driven nets is an error of the check;
- a pulled net (a pull-up or -down): its strong drivers on `<net>_d`, the net `<net>_d`'s level, or the pull's while
  `<net>_d` is `'Z'`: written so, not as `'H'` / `'L'`, the same in both languages (Silinx's VHDL resolution of the
  weak values is wrong, #3926; its Verilog has no `pullup`);
- an open collector output: a `'0'` or `'Z'`; a 4000's input reads `'Z'` as `'X'` (`to_x01`);
- a lamp (an LED, a segment, a light): its output is `to_x01(anode) = '1' and to_x01(cathode) = '0'`.

It is regenerated as every drawing's (on save, after an edit through the MCP server), with its header "generated from
…, do not edit". The HDL does not flow back into the circuit.

## A circuit on the FPGA

A circuit can be an FPGA project's top (#3901): its switches, buttons and clock the board's, its LEDs the board's LEDs.
Its HDL file holds two models of it, one for the simulation and one for synthesis, and nothing else changes for the user:

- **the simulation's model**, as above (the chips' delays, `'Z'`, `'X'`, the power), behind
  `-- synthesis translate_off` … `-- synthesis translate_on`: XST skips it, and so does the Silinx toolchain's front end
  (`core/translate-off.js`, `flowFrontEnd` of `core/synth-front.js`: those lines blanked, the others where they were, so
  that the messages keep the file's line numbers);
- **the digital model** (`core/circuit-digital.js`), which synthesis builds: each net one expression, no `'Z'`, no
  delay, no power. A gate is inlined (only those whose output is read); an MSI or sequential IC is an instance of its
  entity's `digital` architecture (`core/circuit-hdl-ics.js`), its registers flip-flops of the FPGA; open collector
  outputs on one net are ANDed; a contact gives its strong side's level while closed, else the net's default; the
  default is the pull's level, else `'1'` where an IC's input reads the net (a floating 74LS input reads high), else
  `'0'` (an LED on an open line is dark); a three-state output (a 74595's) gives its level while enabled, else the net's
  default; a lamp is its anode and not its cathode. The switches' and the clock's nets are their ports themselves, so
  that synthesis names the clock's net after its port, as the constraints do.

In VHDL each entity has its `digital` architecture first and the simulation's (an IC's `model`, the top's `circuit`)
last, inside the fence: the simulator binds the last one analysed, synthesis sees only the first. In Verilog a module
has one body, chosen by `` `ifdef SILINX_SIM_<NAME> `` (the simulation's) `` `else `` (the digital one): the
`` `define `` is the fenced line, so the simulator defines it and synthesis does not. A gate IC is only in the simulation's model (its gates are inlined).

**Buses.** A single port's label `name[k]` is bit `k` of the vector port `name`: `led[0]` … `led[5]` make
`led : out std_logic_vector(5 downto 0)` (`output [5:0] led`), so the board's pin assignment (*I/O Pin Planning*, New
Project, the UCF) matches them by name as every example's `led`, `sw`, `btn`, `clk`. The check refuses a bus with a bit
missing (its bits 0 to its last), one with inputs and outputs, one named as a scalar port, and a bus's bit on a part of
several ports (a DIP switch, a display: their ports are `<label>_<k>`).

**The example** `breadboard` (`examples/breadboard`): 74LS chips on a full breadboard, a button's presses counted by a
74161 on LD3..LD0, up to 15 (the button synchronised by a 74194 shift register, its four stages on LD4..LD7, its
rising edge `QB and (QB xor QC)` by a 7486 and a 7408, whose other gates stop the count at the 74161's RCO), SW0 clearing
them; its test bench runs the simulation's model; the Silinx toolchain and ISE build it on every board with no warning.
Every output of its MSI and sequential chips is read: XST warns on an instance's unconnected output and on the
flip-flops behind it (Xst:753, Xst:2677), so a circuit that leaves one open builds with ISE's warnings (#4020).

What differs on the FPGA:

- the clock is the board's (50 MHz on the Basys2), not the circuit's clock source's rate; a button is not debounced
  by the board (synchronise it with a clocked chip, as the example does);
- a flip-flop with both an asynchronous preset and an asynchronous clear (7474, 7476, 74112) makes the open synthesis
  warn ("Complex async reset", Yosys), even when its preset is tied high (#3975); the 74161, 74163, 74164 and 74194 have a
  clear only; in Verilog the digital model of those flip-flops keeps its level when both are low and one is released
  (an `always` block sees no release), as XST builds it, where the chip takes the one still low;
- a board whose buttons or switches are active low (the Mimas V2) reads them inverted: a circuit has no generics
  (`core/board-generics.js`) to turn them;
- the power and the shorts are the simulation's only: a circuit with errors has no HDL.

## The MCP server

What the interface does, the MCP server does (CLAUDE.md, #2674):

- `new_source` type `circuit` (empty, or with a breadboard and a supply);
- `circuit_parts`: the library, a part's pins, its logic and delay;
- `edit_circuit`: operations on a circuit: add a part (on a breadboard's hole, `bb1.f10`, or at a grid point), move,
  rotate (a breadboard with its parts; `keep: false`, the editor's Keep connections off), copy (the editor's Copy and
  Paste), wires (curved or straight, the editor's Curved wires), delete, wire two points (holes, pins `U1.3`, `S1.out`, grid points), set a part's label (a bus's bit,
  `led[0]`) or colour;
- `run_process`: a circuit as a project's top synthesized, implemented and its bitstream made, as any top;
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
   logic probe.
4. **The circuit in the rest of Silinx:** a circuit as an FPGA project's top (its switches and LEDs on the board's),
   with an example (4a, #3901: the two models, the buses, `breadboard`); Convert to Schematic (the ICs as symbols); edited live in a shared project, its git merge; labs and
   grading; print and export as SVG.
5. **Sensors, actuators and displays** (digital interfaces, each with its protocol simulated): a rotary encoder, a
   keypad matrix, a buzzer, a servo (PWM), a stepper and its driver, an ultrasonic range sensor, a PIR sensor, a
   temperature and humidity sensor, a character LCD (HD44780, parallel), a graphic OLED (I²C / SPI), an SD card (SPI).
