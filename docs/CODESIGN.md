# Co-design: FPGA and microcontroller nodes, simulated, emulated and on the real boards together

The design of roadmap #4695. Modules on FPGAs and on microcontrollers (an Arduino's AVR, a Raspberry Pi Pico's
RP2040, an ESP32), wired to each other in one drawing, then simulated, emulated and tried on the real boards
together. Nothing of it is built yet; each phase becomes issues of its own when it starts.

## Why

No tool we found co-simulates an FPGA with a microcontroller in a browser.

- **Wokwi** simulates one board per simulation: its FAQ says that wiring two boards together is not possible, a
  long-standing request of its users.
- **Tinkercad Circuits** and **Proteus VSM** run several microcontrollers in one circuit, but have no FPGA.
- **Digital, Logisim-evolution and CircuitVerse** have logic and HDL, but no microcontroller.
- **The industry's co-design flows** are desktop tools, commercial and heavy for a class:
  - Vivado IP Integrator with Vitis `hw_emu`: the Zynq's PS in QEMU, the PL in an HDL simulator;
  - Intel Platform Designer with Nios V: Avalon BFMs, the CPU in RTL;
  - LabVIEW FPGA with RT;
  - Simulink with HDL Coder and Embedded Coder.

What the others teach us:

- **Small, explicit contracts.** Pins first: GPIO, UART, SPI and I²C (Wokwi's chip pinouts). A memory-mapped bus as
  the advanced level: AXI on the Zynq's PS, Avalon BFMs, Renode's APB / AXI bridges.
- **One master time with a quantum, and determinism**: SystemC/TLM's quantum keeper, QEMU's remote-port
  `-sync-quantum`, Renode's time framework. Renode's own tests show a UART between nodes failing when the quantum is
  too wide. Determinism is what grading, CI and live sharing need.
- **The same binary in the simulation and on the board** (Wokwi, Renode, Proteus): the way to the real board stays
  short.
- **Both sides of a contract generated from it.** Simulink generates both an IP core's AXI-Lite register map and the
  processor's software interface; Silinx's HLS already generates the AXI-Lite slave and its map.
- **Simulations get the channels between domains wrong.** LabVIEW FPGA's simulation handles DMA FIFOs and parallel
  loops badly. So the links are simulated pin by pin, with decoders on top.
- **Scenario tests** (Wokwi CI, cocotb's triggers): press, set, wait for an edge or a serial text, expect. They fit
  `grade` and the labs.

## The System document

A **System** (`<name>.sys.json`) is a design source of an ordinary project, made with New Source (its type: System) and shown
in the Design pane as `[System]`.

- **Its canvas** follows the schematic editor's style and the rules of [UI-GUIDELINES.md](UI-GUIDELINES.md).
- **It holds nodes and links.**
- **The project keeps its one `board`** for the classic flow. Each FPGA node names its own board and pins, and is
  built with the flow of that board's family.

| Node | Holds | Board |
|---|---|---|
| FPGA | a module of the project (HDL or a drawing) as the node's top | a Silinx board and its pins |
| Microcontroller | its firmware: an `.hex` / `.elf` / `.uf2` given, later a C / Arduino sketch compiled on the server, or MicroPython (`.py`) | Arduino Uno / Nano (ATmega328P), Raspberry Pi Pico (RP2040), ESP32 DevKit, ESP32-C3 |
| Circuit | a `.circ.json` (breadboards, 74xx, an Arduino on a breadboard) | — |
| Peripheral | a model: a serial terminal, a potentiometer (ADC), an I²C sensor, an OLED, a servo, an MQTT broker, a VGA monitor | — |
| Zynq (with its roadmap) | the PS's program and the PL's module | Zybo Z7, Arty Z7 |

**A link joins an interface of one node to one of another, and has a kind:**

| Link | Signals | Its parameters | Checked |
|---|---|---|---|
| GPIO | 1..n wires | direction | one driver per wire, directions, **5 V outputs on a 3.3 V input** (a warning: a real lesson) |
| UART | TX → RX, RX ← TX | baud, frame (8N1…) | the same baud and frame at both ends, TX crossed with RX |
| SPI | SCLK, MOSI, MISO, CS | mode, frequency | one master, the same mode |
| I²C | SDA, SCL (open-drain) | addresses | pull-ups, no two devices at one address |
| Parallel bus | data, address, control | widths | the widths |
| AXI-Lite (Zynq) | the AXI channel | the register map | the same map at both ends |
| Network (MQTT) | topics | broker | a topic subscribed with no publisher |

**How an interface is declared.** It is declared once:

- on an FPGA node, as a set of the top's ports;
- on a microcontroller, as a peripheral and its board's pins (`Serial` on D0 / D1, `SPI` on D10–D13);
- on a connector, as a pin map (a Pmod on the Arduino's header).

The check runs when the system is saved and when it is built, its messages in the console as every check's.

**A register map** is the advanced interface. The student declares the registers once: name, address, width,
read / write. Silinx generates both sides:

- the slave in VHDL and Verilog (SPI, or AXI-Lite through `core/c-axi-lite.js`);
- the firmware's header (`.h`, or a MicroPython module).

## Simulating everything together

**One co-simulation scheduler**, a new core module (system-sim, #4696). It is isomorphic and runs in one Web Worker; it needs no
`SharedArrayBuffer`, so no cross-origin isolation, which GitHub Pages cannot set.

- **The global time is in ps.**
- **Each engine sits behind an adapter** with `advanceTo(t)`, `setPin(name, value)`, its pins' changes with their
  times, and `nextEventTime()`.
- **The synchronisation is conservative, with an adaptive quantum.** Each node runs to the end of the quantum, or to
  the next known event of another node, whichever comes first. The pins that changed are exchanged at the
  quantum's edges. The quantum is fine while a link is active (a sixteenth of a UART bit) and wide while the links
  are idle.
- **Links are exchanged pin by pin**, so the run is exact, the logic analyzer sees the protocol, and a protocol's
  errors show. Decoders on top give the UART bytes, the SPI and I²C transactions, the MQTT messages.
- **Runs are deterministic**: the same system and inputs give the same run.

The engines:

| Node | Engine | Licence | Notes |
|---|---|---|---|
| FPGA | Silinx's compiled engine (`core/compiled-sim.js`), or the event-driven simulator for full waves and `inout` | Silinx's | both are already driven from outside; the compiled one runs in a Worker |
| AVR | [avr8js](https://github.com/wokwi/avr8js) | MIT | GPIO, timers, USART, ADC, SPI, TWI (as a slave: to check) |
| RP2040 | [rp2040js](https://github.com/wokwi/rp2040js) | MIT | runs MicroPython's own firmware (UF2) and the student's `.py` |
| ESP32 | MicroPython's [WebAssembly port](https://github.com/micropython/micropython/tree/master/ports/webassembly) with a `machine` module of Silinx's (Pin, UART, SPI, I2C, PWM, ADC, a simulated `network`) | MIT and Silinx's | behavioural, and it says so: it is not the chip (no exact timing, no real interrupts). The same `.py` runs on the real board |
| ESP32, real firmware (later, optional) | [Espressif's QEMU](https://github.com/espressif/qemu) on the local server, synchronised over a socket with a quantum (remote-port's way) | GPL-2.0 | a separate program the user installs; GPL-2.0 is not combined with Silinx's AGPL-3.0 code. There is no Xtensa QEMU in WebAssembly |
| Circuit | the circuit's Try it (`core/circuit-sim.js`) | Silinx's | already event-driven in ns |
| Peripherals | JS models, shared with #3902 | Silinx's | — |

Wokwi's ESP32 engine and its service are not used: they are proprietary. Only Wokwi's MIT libraries are.

**Speed.** These are estimates, to be measured by #4696's benchmark:

- avr8js reaches real time at 16 MHz in a browser;
- the compiled engine runs tens of millions of cycles a second on a small design;
- an FPGA at 50 MHz with an AVR should run between 0.2× and 1× real time;
- the event-driven engine (full waves) runs in kHz, as today: the System's simulation records a short window, and
  its emulation runs the compiled engine with no waves;
- the FPGA nodes' UART and clock generics are scaled as the Board Emulator does (`autoTimeScale`).

## Emulation

The Board Emulator gets a **system** mode.

- **Each node's board is drawn**, side by side: the FPGA boards' existing drawings, and new drawings of the Arduino
  Uno / Nano, the Pico and the ESP32 DevKit, Silinx's own, made from the KiCad footprints of the catalogue. The
  links are drawn between their connectors.
- **Every part is interactive**, as today.
- **A serial terminal per UART**, and per microcontroller's console.
- **The peripherals are set while running**: a potentiometer turned, a sensor's temperature changed.
- **A link inspector** (a foldable side panel) shows each link's decoded traffic with its time.
- **The system's waves**: one VCD with every node's signals and the links' named signals, in the waveform viewer.

**Still to solve.** Today's emulator has the fixed document id `'emulator'`, and its compiled engine takes one
clock. In system mode each FPGA node gets an engine of its own.

## Real boards

**Building and programming each node:**

| Node | How it is programmed |
|---|---|
| FPGA | as today: the Silinx toolchain, ISE or Vivado, then WebUSB or the server |
| AVR | over **Web Serial**, with the Arduino bootloader's STK500 protocol; from the server, through its serial port |
| ESP32 | [esptool-js](https://github.com/espressif/esptool-js) (Apache-2.0, Web Serial) for the firmware; MicroPython's raw REPL for the `.py`, with no compiler |
| Pico | its UF2 copied once, then the `.py` over the raw REPL |

Web Serial is in Chrome, Edge and Firefox. It is not in Safari nor on the iPad, which have no WebUSB either.

**Hardware in the loop.** Each node is either simulated or real.

- **A real microcontroller and a simulated FPGA.** The board's USB serial port is joined to the simulated FPGA
  node's UART. The real firmware then talks to the student's HDL before it is synthesized.
- **A real FPGA and a simulated microcontroller.** This goes through the FPGA board's USB-UART where it has one. Or
  it goes through a pin bridge over JTAG: a generated BSCAN core, as the logic analyzer's, reading and writing a
  Pmod's pins. The bridge is slow (kHz), fine for slow GPIO only.
- **All nodes real, with probes.** The FPGA's logic analyzer captures the pins the microcontroller is wired to,
  named after the link and decoded.

## Example systems for a course

1. **`uart-avr`** (phase 1). An Arduino sends commands over UART, the FPGA shows them on its LEDs and 7-segment
   display, and answers with its switches. It teaches serial protocols, state machines and a shared baud rate.
2. **An SPI peripheral with a register map.** It is generated from the map: the FPGA side (a PWM, a counter) and the
   AVR's header. It teaches the hardware/software interface, a small AXI-Lite.
3. **A sensor, an ESP32, an FPGA and VGA.** An I²C temperature sensor is read by an ESP32 in MicroPython, sent over
   SPI or UART to the FPGA, and drawn as a bar on VGA. It teaches what goes to software and what goes to hardware.
4. **Two ESP32s over MQTT.** One publishes a sensor's topic; the other subscribes and passes the value on to an FPGA.
   The broker is a node of Silinx's. It teaches IoT and topics.
5. **Precise PWM.** The AVR computes the servos' positions; the FPGA generates eight exact PWMs.
6. **Zynq.** The A9's C writes the student's module's AXI-Lite registers.

A scenario test fits `grade` and the labs: press the Arduino's button, expect "OK" on the FPGA's UART.

## Where each part runs

| Part | Browser | Local server | Outside tools |
|---|---|---|---|
| The System document, its check, the scheduler, the FPGA engines | yes | yes | — |
| AVR, RP2040 | yes | yes | avr8js, rp2040js (MIT) |
| ESP32 (behavioural) | yes | yes | MicroPython (MIT) |
| ESP32 (real firmware) | — | yes, if the user installs it | Espressif's QEMU (GPL-2.0) |
| Compiling C / Arduino | later, if ever | yes, if the user has the tools | avr-gcc / arduino-cli (GPL); ESP-IDF (Apache-2.0, binary Wi-Fi libraries), arduino-esp32 (LGPL-2.1) |
| The System Emulator, the waves | yes | yes | — |
| Programming over Web Serial | Chrome, Edge, Firefox | yes | esptool-js (Apache-2.0) |

## The MCP server

Every action is a tool (#2674), through the same functions as the interface:

| Tool | What it does |
|---|---|
| `system_info` | describes the system |
| `edit_system` | adds, changes or removes a node or a link |
| `check_system` | runs the check |
| `simulate_system` | runs for a time and returns each node's serial output, the links' traffic and the VCD |
| `node_firmware` | sets a node's firmware |

Later:

| Tool | What it does |
|---|---|
| `emulate_system` | presses, sets and reads each node |
| `node_mode` | sets a node simulated or real |
| `program_node` | programs a node's board |
| `compile_firmware` | compiles a node's firmware |

The existing `program_board` and `capture` serve the FPGA nodes.

## Risks and unknowns

- **Speed** is the first unknown. #4696 measures it before the rest is built.
- **No open ESP32 engine runs in a browser.** The behavioural MicroPython node is honest but limited, and the guide
  says so.
- **avr8js's peripherals** are to be checked; in particular an AVR as an SPI or I²C slave of an FPGA.
- **Web Serial** is not on Safari nor on the iPad. Windows needs drivers for the CH340 USB-serial chips.
- **Several boards in a project** touch the build flow. The project keeps its one `board`, and the FPGA nodes are
  built one by one.

## Phases

1. **Two nodes, UART, simulated:**
   - #4696 the scheduler, the FPGA engines' adapters and a benchmark (first);
   - #4697 the System document and its check;
   - #4698 an AVR node, a given `.hex`;
   - #4699 the links' decoders and the waves;
   - #4700 the System editor;
   - #4701 the simulation view;
   - #4702 the MCP tools, the `uart-avr` example, the user's guide.
2. **Emulation and more links:**
   - the System Emulator with several boards;
   - GPIO, SPI and I²C links and their checks;
   - the peripheral nodes (#3902);
   - the register map generating both sides;
   - a circuit as a node, its Arduino simulated (#4396's AVR step).
3. **Real boards:**
   - Web Serial;
   - programming the AVR;
   - the real board's terminal;
   - hardware in the loop over UART;
   - the logic analyzer on the links.
4. **RP2040 and ESP32 in MicroPython:**
   - rp2040js;
   - MicroPython in WebAssembly with Silinx's `machine`;
   - `.py` onto the real boards;
   - an MQTT broker node.
5. **Compiling firmware:**
   - avr-gcc / arduino-cli on the local server;
   - Espressif's QEMU as an optional engine.
6. **Zynq and soft cores:**
   - the PS–PL as an AXI-Lite link, the Zynq's processor engines as the scheduler's adapters;
   - #4396's soft cores as FPGA nodes with the common instruction view.

## Decided

- The System is a document in a project, not a set of projects.
- The AVR comes first; the ESP32 comes in MicroPython.
- The firmware is a given `.hex` first; a compiler on the server comes later.
- Links are exchanged pin by pin, with an adaptive quantum.
- The boards' drawings are Silinx's own; New Source names the document "System".
- One scheduler serves the circuit's Arduino, the System's nodes and the Zynq's processors.
