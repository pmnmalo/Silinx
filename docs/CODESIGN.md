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

A **System** (`<name>.sys.json`, `core/system-doc.js`, #4697) is the top of a **co-design project**, a project kind of
Silinx (#5041): New Project asks the kind first; its co-design choice makes one, empty or from the example `uart-avr` (#4702). A
co-design project has one System, shown in the Design pane as `[System]`.

- **Its canvas** follows the schematic editor's style and the rules of [UI-GUIDELINES.md](UI-GUIDELINES.md). The System
  editor (`web/js/system-editor.js`, #4700) places the nodes (an FPGA node, an Arduino Uno or Nano, a serial terminal),
  links their interfaces (a click on one, then on another of its kind), and edits a node's, an interface's and a link's
  properties in its side panel; each edit is one of `core/system-edit.js`, the MCP's `edit_system`'s.
- **It holds nodes and links.**
- **A co-design project has no `board` of its own.** Each FPGA node is a module of the co-design project itself (HDL
  or a drawing), names its own board and pins, and is built with the flow of that board's family.

| Node | Holds | Board |
|---|---|---|
| FPGA | a module of the co-design project (HDL or a drawing) as the node's top | a Silinx board and its pins |
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

**SPI** (#5214): an Arduino is the master on its board's SPI (SCK D13, MOSI D11, MISO D12; SS D10 its program's own
pin), an FPGA node the peripheral on four ports of its module (`{ name, kind: 'spi', sck, mosi, miso, ss, hz, mode }`).
The AVR node draws SCK and MOSI from the byte its program writes to SPDR, at its clock divider and mode
(`core/system-sim-avr-spi.js`), and reads MISO at each sampling edge from the levels it got. Each of the link's four
wires has a fixed latency of a sixteenth of the interface's SCK period, so that MISO's answer is back before the next
edge; SS floating reads high (the link's `pull`). The decoder (`decodeSpi`) gives each transfer's MOSI and MISO bytes,
and warns when the program's SCK is faster than the interface says.

**How an interface is declared.** It is declared once:

- on an FPGA node, as a set of the top's ports;
- on a microcontroller, as a peripheral and its board's pins (`Serial` on D0 / D1, `SPI` on D10–D13);
- on a connector, as a pin map (a Pmod on the Arduino's header).

The check (`core/system-check.js`, the MCP's `check_system`) runs when the system is saved and when it is built, its
messages in the console as every check's: a node's or a link's id, kind, board, module or firmware unknown; an
interface's baud, frame, pins and direction; an FPGA node's port not of its module, of the wrong direction (a TX that is
an input: TX and RX crossed), with no pin or a pin not on its board; the baud and the frame equal at both ends; a wire
driven twice or by nothing (a warning); a pin used by two links; a 5 V output on a 3.3 V FPGA input (a warning); a node
that joins nothing (a warning).

The format (version 1):

```json
{ "format": "silinx-system", "version": 1, "name": "uart_avr",
  "nodes": [
    { "id": "fpga", "kind": "fpga", "module": "uart", "board": "basys2", "variant": "250", "pins": { "rx": "J3", "tx": "A3" },
      "interfaces": [{ "name": "uart", "kind": "uart", "tx": "tx", "rx": "rx", "baud": 9600, "frame": "8N1" }], "x": 0, "y": 0 },
    { "id": "uno", "kind": "mcu", "board": "arduino-uno", "firmware": "firmware/echo.hex",
      "interfaces": [{ "name": "Serial", "kind": "uart", "baud": 9600, "frame": "8N1" },
                     { "name": "btn", "kind": "gpio", "pins": ["D2"], "dir": "in" }], "x": -200, "y": 0 },
    { "id": "term", "kind": "terminal", "interfaces": [{ "name": "serial", "kind": "uart", "baud": 9600, "frame": "8N1" }], "x": 0, "y": 200 } ],
  "links": [{ "id": "serial", "kind": "uart", "a": "uno.Serial", "b": "fpga.uart" }] }
```

An FPGA node's interfaces name its module's ports (`led<0>`, a bus's bit) and `pins` puts each on a pin of its board;
a microcontroller's name its board's pins, its UART the board's (`Serial`: TX D1, RX D0). A UART link joins a's TX to
b's RX and b's TX to a's RX; a GPIO link its ends' pins in order.

**A register map** is the advanced interface. The student declares the registers once: name, address, width,
read / write. Silinx generates both sides:

- the slave in VHDL and Verilog (SPI, or AXI-Lite through `core/c-axi-lite.js`);
- the firmware's header (`.h`, or a MicroPython module).

## Simulating everything together

**Simulate System** (#4701) is the System editor's bottom panel, opened by its toolbar's **Try it** (the green Try it panel of the drawing editors, #5194): the page compiles each FPGA node's module (Yosys) and
reads the firmware (`core/system-run.js` systemInputs), a Web Worker builds and runs the System (`core/system-host.js`,
`core/system-build.js`: an FPGA node at its board's clock, its UART's RX idle at 1 when no link drives it; each wire with
a fixed latency, a sixteenth of its bit), and the panel shows the run: its time, a terminal for each terminal node, the
link inspector (each wire's decoded bytes) and the waves in the waveform viewer.

**One co-simulation scheduler**, a new core module (system-sim, #4696). It is isomorphic and runs in one Web Worker; it needs no
`SharedArrayBuffer`, so no cross-origin isolation, which GitHub Pages cannot set.

- **The global time is in ps.**
- **Each engine runs in batches** behind one contract: `run(t1, inputEvents)` runs it to `t1`, with its inputs set
  at their exact times, and returns its outputs' changes with their times.
  - An FPGA node runs `cycle(n)` between its input events and records its watched outputs' changes with their
    cycles inside the batch. The compiled engine's `watch.uart` already does this for one pin; it is generalised to
    every pin of a link.
  - Lockstep cycle by cycle is not needed, and it would be slow: a `cycle(1)` call costs about 75 ns, so it caps a
    50 MHz node at about 0.27× real time.
- **The synchronisation is a window bounded by the links' lookahead.**
  - In each window, the microcontrollers run first and produce their events at their exact times. The FPGA then
    runs with those inputs at their exact cycles. Its outputs reach the microcontrollers at the window's end, so
    they arrive at most one window late.
  - The window follows the fastest link: a tenth of a UART bit, half an SPI clock period, a GPIO's set value. The
    user does not see it.
  - The measured limit: a UART at 9600 baud gives the right result up to a 10 µs window and goes wrong at 100 µs.
- **The links are pin by pin on the FPGA's side and in the logic analyzer.**
  - The emulators' peripherals are transactions, not pins:
    - avr8js's USART: `onByteTransmit`, `writeByte`; its SPI: `onByte`, `completeTransfer`, master only; its TWI:
      master only;
    - rp2040js's UART, SPI and I²C: master only for SPI and I²C.
  - So each link's adapter turns a byte into its pins' waveform at the exact times (start, data and stop bits at the
    baud), and decodes the FPGA's pins back into bytes at the microcontroller's own settings (`core/uart.js`
    `UartDecoder`). A wrong baud still gives garbage, as on a real board.
  - The microcontrollers' GPIO pins are pins in both emulators (their ports' listeners).
  - The AVR and the Pico are therefore the masters of SPI and I²C links, and the FPGA is the peripheral.
  - Decoders on top give the UART bytes, the SPI and I²C transactions, and the MQTT messages.
- **Runs are deterministic**: the same system and inputs give the same run.

The engines:

| Node | Engine | Licence | Notes |
|---|---|---|---|
| FPGA | Silinx's compiled engine (`core/compiled-sim.js`), or the event-driven simulator for full waves and `inout` | Silinx's | both are already driven from outside; the compiled one runs in a Worker |
| AVR | [avr8js](https://github.com/wokwi/avr8js) | MIT | GPIO, timers, USART, ADC; SPI and TWI as a master only |
| RP2040 | [rp2040js](https://github.com/wokwi/rp2040js) | MIT | runs MicroPython's own firmware (UF2, downloaded once) and the student's `.py` through its REPL over the emulated USB; it needs the RP2040's bootrom (Raspberry Pi's, BSD-3) |
| ESP32 | MicroPython's [WebAssembly port](https://github.com/micropython/micropython/tree/master/ports/webassembly) with a `machine` module of Silinx's (Pin, UART, SPI, I2C, PWM, ADC, a simulated `network`) | MIT and Silinx's | behavioural, and it says so: it is not the chip (no real interrupts); its time is virtual, a time per line through `sys.settrace`. The same `.py` runs on the real board. The browser build needs JSPI (Chrome and Edge 137+, Firefox 153; not Safari) |
| ESP32, real firmware (later, optional) | [Espressif's QEMU](https://github.com/espressif/qemu) on the local server, synchronised over a socket with a quantum (remote-port's way) | GPL-2.0 | a separate program the user installs; GPL-2.0 is not combined with Silinx's AGPL-3.0 code. There is no Xtensa QEMU in WebAssembly |
| Circuit | the circuit's Try it (`core/circuit-sim.js`) | Silinx's | already event-driven in ns |
| Peripherals | JS models, shared with #3902 | Silinx's | — |

Wokwi's ESP32 engine and its service are not used: they are proprietary. Only Wokwi's MIT libraries are.

**Speed, measured** in Node, wall clock, by a throwaway prototype (2026-11-19). The browser's figures are to be
confirmed by #4696's benchmark in a Worker:

| Run | Speed |
|---|---|
| avr8js alone (ATmega328P at 16 MHz) | 9× real time |
| the compiled engine, the `uart` example at 50 MHz, in a batch | 2.2× real time |
| the event-driven engine, the same design | 184,000 cycles a second, about 0.004× real time |
| **an AVR and the `uart` example's FPGA**, linked by UART at 9600 baud, echoing bytes in a closed loop | 0.5× to 0.9× real time (window 1 to 10 µs), every byte right |
| the same at 115,200 baud | 0.45× to 0.5× real time (window 0.5 to 1 µs) |
| rp2040js running MicroPython's real Pico firmware | about 0.8× real time; boot to the REPL in about 60 ms |
| MicroPython in WebAssembly (Chrome) | 300,000 loop iterations in 15 ms; 5 million line events a second with `sys.settrace` |

- **The system's waves come from the compiled engine.** It records the links' pins and the microcontrollers' pins
  in its batches, almost for free.
- **The event-driven engine is for short windows only.** It gives a design's internal signals; a UART byte at 9600
  baud takes about 0.3 s with it.
- **The FPGA nodes' UART and clock generics** are scaled as the Board Emulator does (`autoTimeScale`).

## The System and the circuit: one model, two views

Decided with the maintainer (#5200). The System document is the model: blocks and protocols (nodes, their interfaces,
links by protocol, each link's decoder and quantum). It is what makes the decoded bytes, a fast co-simulation, and
later the register map and the SPI and I²C transactions. The circuit (the breadboard: wires, pins, electrical levels,
LEDs and resistors) is a second view of it, not a replacement:

- **The circuit gets the boards as parts**: the Arduino Uno / Nano and the FPGA boards, with their real pins.
- **A circuit can be a node of the System**: what lies between the boards (a level shifter, LEDs, buttons, a
  sensor), wired pin by pin, its pins the System's links (phase 2).
- **The System editor gets a wiring view**: each link pin by pin, from one board's connector to the other's (the
  pins are already the System's: an FPGA node's `J3`, an Arduino's `D0`; the 5 V warning comes from them).

A System drawn only as a circuit would lose the protocol level: the decoders, the speed and the links' checks.

## The System's actions

The parts are developed together: the System gets the project's actions, for all its nodes at once and for each
node alone, as the Design pane's processes do for a module.

| Action | The whole System | One node |
| --- | --- | --- |
| Check | its document and every node (done, #4697) | its module's Check Syntax; its firmware read |
| Try it | every node simulated together (done, #4701) | an FPGA node's test bench; a microcontroller alone with a terminal on its UART |
| Emulate | the System Emulator, every board drawn (phase 2) | the Board Emulator, as today |
| Implement | every FPGA node implemented, every firmware compiled (phases 3 and 5) | Implement Design for its board; its firmware compiled |
| Program | every board programmed, one after another (phase 3) | Program for its board; the AVR over Web Serial |

Each action says its nodes' results in the console, one line a node; the MCP server does the same (#2674).

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

**Its core** (#5212, `core/system-emu.js`): each FPGA node's board is the Board Emulator's (`boardWiring`: its module's
ports on its board's pins, the node's `pins`), each node its own engine in the scheduler. Its switches and buttons are
the inputs no link drives (`setBoardInput`). Its LEDs and display are watched outputs, kept by the scheduler's `watch`
and shown as the Board Emulator shows them (`boardOutputs`). An Arduino's board shows its pins' levels and its LED L
(D13). The System's worker (`core/system-host.js`) gets `init { emulate }`, `set`, and each `state` with what the
boards show since the last.

**Its view** (#5212, `web/js/system-emu-view.js`): a document of its own, `sysemu:<file>`, opened from the System
editor's Emulate or the System row's Emulate System. An FPGA board is mounted with the Board Emulator's parts
(`mountBoardParts`), a button held down until the design saw a real press (`pressHolds`). An Arduino is drawn by
`web/js/emulator-arduino.js`, Silinx's own. The terminals are in the side panel. The run follows real time, at most 50
ms a run, the backlog dropped when it falls behind; the status line has the time and the rate. The MCP server's
`simulate` of a System takes `controls` (`[{ node, control: btn0, on, at_ns }]`) and says what the boards show at the
end, through the same functions.

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
| `edit_system` | adds, changes or removes a node, an interface or a link (#4700) |
| `check_system` | describes the system and runs the check (#4700) |
| `simulate` (a System) | the existing tool: `top` a System document (a co-design project's by default) runs it for a time and returns each wire's bytes, the terminals' text and the warnings; the VCD in `build/<name>.vcd` (#4701) |
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
- **avr8js and rp2040js are masters only for SPI and I²C.** An AVR as an SPI or I²C slave is not simulated: that
  would be a contribution to avr8js.
- **The compiled engine refuses `inout` ports.** An FPGA's I²C slave (an open-drain SDA) would fall back to the
  event-driven engine. A top-level `inout` must become three signals in the compiled engine: input, output and
  enable, from Yosys's `$tribuf` (#4709). This is needed before the I²C links.
- **MicroPython's WebAssembly build needs JSPI** (no Safari).
  - One MicroPython node can call the scheduler from inside its `sleep`.
  - Several need to be suspended and resumed, through JSPI, or each needs a Worker of its own.
- **Web Serial** is not on Safari nor on the iPad. Windows needs drivers for the CH340 USB-serial chips.
- **Several boards in a project** touch the build flow. Until phase 3, a System has one FPGA node built (as most
  course systems: one FPGA, one or more microcontrollers); several FPGA nodes are simulated only. Later, the FPGA
  nodes are built one by one, each on its own board.

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
   - a circuit as a node, its Arduino simulated (#4396's AVR step); the boards as the circuit's parts;
   - the System editor's wiring view, each link pin by pin (#5200).
3. **Real boards:**
   - Web Serial;
   - programming the AVR;
   - the real board's terminal;
   - hardware in the loop over UART;
   - the logic analyzer on the links;
   - Implement System and Program System: every node at once (#5200).
4. **RP2040, then ESP32, in MicroPython** (the Pico first: exact and in every browser):
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

## In a release

Co-design is off in a release until it is stable (#5202): the site's root, the release's zip and its local server (a
release's checkout, its tag's commit) hide New Project's Co-design (its card disabled, the reason said), the `uart-avr`
example, the Design pane's System row and the System editor (a `.sys.json` opened says so in the console), and the MCP
server refuses `new_project` kind codesign, `edit_system`, `check_system` and `simulate` of a System with the same
message. The development build (the site's `dev/`) and a checkout's local server (`npm start` at any other commit) have
it, and so do the tests (`node --test`: core/build-channel.js `channelFromEnv`; `SILINX_CHANNEL=release` tests a
release, `SILINX_CHANNEL=dev` runs a release's server with it).

**Turning it on** in a release is one change: `CODESIGN_IN_RELEASE = true` in `core/build-channel.js`, with its
changelog fragment.

## Decided

- The System is a co-design project's top, its one System document (#5041); its FPGA nodes are modules of that project.
- The AVR comes first; the ESP32 comes in MicroPython.
- The firmware is a given `.hex` or `.elf` first; a compiler on the server comes later.
- The System is the model, the circuit a second view of it: the boards are the circuit's parts, a circuit can be a
  System's node, and the System editor gets a wiring view (#5200).
- The System has the project's actions for every node at once and for each node alone (#5200).
- Links are pins on the FPGA's side, the microcontrollers' peripherals converted by the links' adapters; one
  window, bounded by the links' lookahead (measured, see Speed).
- The boards' drawings are Silinx's own; co-design is a project kind, chosen in New Project (#5041).
- One scheduler serves the circuit's Arduino, the System's nodes and the Zynq's processors.
- The ESP32 runs MicroPython in WebAssembly, with a virtual time per line through `sys.settrace`. It needs JSPI, so
  it is not simulated in Safari. The Pico runs MicroPython's real firmware on rp2040js and comes first in phase 4.
- A System has one FPGA node built until phase 3.
- The AVR and the Pico are the masters of SPI and I²C links, and the FPGA is the peripheral.
- A link's synchronisation is a property of the link. A fixed latency is exact at every quantum and is the default,
  because grading needs determinism. An adaptive quantum is faster, but its timing-sensitive exchanges depend on the
  quantum (#4710's benchmark).
