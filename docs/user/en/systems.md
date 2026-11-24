# Systems: an FPGA and a microcontroller together

[User's guide](README.md) · English · [Português](../pt/systems.md)

A **System project** is a system of FPGA and microcontroller nodes linked together, designed and simulated as one:
an FPGA module of the project on its board, an Arduino Uno or Nano running its firmware, a serial terminal, joined by
UART and GPIO links. Its design is in [SYSTEMS.md](../../SYSTEMS.md); its roadmap is #4695.

## A System project

- **New Project ▸ System.** It has no board of its own: each FPGA node of its System names its board and pins, each
  microcontroller its firmware. Start from **Empty** (its System, `<name>.sys.json`, with no node yet) or from the
  example **uart-avr** (an Arduino and the `uart` example's FPGA linked by UART).
- **A System as the top of an FPGA project**: the Top-Level Source Type **System** (New Project, Design
  Properties), or **Set as Top Module** on a System (`.sys.json`, in the Files view), makes the project a System
  project, that System its top; its board is kept. **Set as Top Module** on one of its modules makes it an FPGA project
  again, on the board of the FPGA node that runs that module (else the board it had).
- **Its System** is its top, shown in the Design pane as `<name> [System]`, the FPGA nodes' modules under it. It opens
  in the **System editor**: the tools place an FPGA node, an Arduino Uno or Nano, a serial terminal; **Link** joins two
  interfaces of one kind (a click on one, then on the other); the Properties panel sets a node's module, board and pins,
  a microcontroller's board and firmware (an Intel HEX, `.hex`, or avr-gcc's `.elf`; an `.elf` in the browser edition
  needs a workspace folder, its storage keeping text files only), an interface's TX and RX ports, baud and frame.
- **Its check** says its errors and warnings in the console as it is edited, and Check writes them in the Console: a
  module's port that is no port of it, TX and RX crossed, different bauds at the two ends of a link, a node that joins
  nothing, and a 5 V output on a 3.3 V FPGA input (an Arduino's TX on an FPGA's RX: on the real boards, a level shifter
  or a divider).
- **GPIO links** join pins one to one: **+ GPIO** on a node adds its interface, its pins (an FPGA node's module ports,
  a bus's bit as `led<0>`; an Arduino's D2, A0…) and its direction in the Properties panel, then **Link** joins it to
  another node's GPIO with as many pins. Its check: two outputs on one wire, two inputs (nothing drives the wire), a pin
  linked twice, and the 5 V output on a 3.3 V FPGA input. Try it runs it as a wire, its changes in the link inspector
  and the waves.
- **SPI links** join an Arduino, the master, to an FPGA, the peripheral: **+ SPI** on the Arduino adds its board's SPI
  (SCK D13, MOSI D11, MISO D12; SS is D10, the program's own pin), **+ SPI** on an FPGA node its module's four ports
  (found by their names: sck, mosi, miso, ss), then **Link** joins them. Each end says its SCK rate (at least the
  program's: 125000 Hz at SPI_CLOCK_DIV128) and its mode (0 to 3), the same at both. Try it shows each transfer's bytes,
  MOSI's and MISO's, in the console's lines. The **spi-avr** example: an Arduino sends a count every 47 ms or so, the FPGA
  shows it on its LEDs and answers with the one before plus one, shown on the Arduino's D2..D7.
- **I²C links** join an Arduino, the master, to an FPGA, the peripheral: **+ I²C** on the Arduino adds its board's I²C
  bus, Wire (SCL A5, SDA A4), **+ I²C** on an FPGA node its module's two ports (found by their names: scl, sda), its SDA
  an inout port (`sda <= '0' when pull = '1' else 'Z'`: pulled low or released, never driven high), then **Link** joins
  them. Each end says its SCL rate (at least the program's: 100000 Hz with Wire), the same at both. Try it shows each
  transfer in the console's lines: W or R, the address, the bytes (NACK where one was not acknowledged), and warns of an
  address no peripheral acknowledged. The **i2c-avr** example: an Arduino writes a count every 47 ms or so to the FPGA
  at the address 0x42, shown on its LEDs, then reads the FPGA's switches back, shown on the Arduino's D2..D7.
- **Wiring** in the System editor's toolbar shows each link pin by pin: the two boards facing each other, a row for
  each wire with its signal (TX, SCK, SDA…), the pin at each end (an FPGA's port and its package pin, `rx · J3`; an
  Arduino's `D1`), the levels and an arrow towards the input. A wire with a 5 V output on a 3.3 V input is orange, its
  warning its tip, as are an FPGA pin's place on its board (`UART RX on a PmodUSBUART in JA…`). The view is read
  only: the links are edited in the System view; a click on a wire selects its link. Wiring again goes back.
- **The boards in a circuit**: the Circuit editor's Parts panel has **Boards**, the Arduino Uno and Nano, the Basys2 and
  the Nexys2, with their real pins (D0…D13, A0…; an FPGA board's Pmod pins JA1…, each with its package pin in its tip),
  each drawn as the emulators draw it, at the circuit's scale, its pins where its headers' and Pmods' are. A Nano sits across a breadboard's channel. A board's 5V, 3V3 and GND power the breadboard; its other pins are its
  program's or its design's, driven once the circuit is a node of the System (alone, in Try it, they drive nothing).
- **A circuit between the boards**: **Circuit** in the System editor's toolbar adds a circuit node, a circuit of the
  project (its Properties' Circuit). Label each board in the circuit with its node's id (an Uno labelled `uno` is the
  node uno): the pins the circuit wires are then the System's links, an Arduino's both ways, an FPGA's the way the port
  on that pin goes. Check says a board that names no node, a pin that is also a link's, and a 5 V Arduino pin on a
  3.3 V FPGA input; Try it runs the circuit with the boards, and says each LED (lit at the end, the times it lit).
  **Emulate** draws the circuit beside the boards: its LEDs light as the run goes, and a click turns a switch or
  presses a button (held while the mouse is down), as on the bench.

## Register maps

A **register map** (New Source ▸ **Register Map**, `<name>.regs.json`) declares once the registers an FPGA peripheral
shows the Arduino, and Silinx generates both sides:

- **the FPGA's module**, named as the map, in VHDL or Verilog (the project's language), its registers behind an SPI
  slave (mode 0) or an I²C slave (at the map's address, SDA an inout port). Its HDL file is made from the map, as a
  drawing's: in the Design pane, the map's row has its **Registers** badge first;
- **the Arduino's header**: the editor's **Header** button writes `firmware/<name>.h`, the registers' addresses and a
  `<name>_read_<register>()` and `<name>_write_<register>(v)` for each, through `SPI` or `Wire`.

The editor is a table, a row for each register: its address (a register takes a byte address for each 8 bits, the least
significant byte first), its name, its width (1 to 32 bits), its access (**rw**: written by the program and read back,
an output of the module; **ro**: read only, an input of the module, its logic's; **wo**: written only) and its reset
value; **Strobe** adds an output `<name>_wr`, a pulse of one clock cycle when the register is written. **+ Register**
adds one after the last; the toolbar chooses the bus (SPI, or I²C and its address); **Check** says the problems
(two registers at one address, a name the module uses itself…) in the console. On SPI, a transaction is a command byte
(`R << 7 | address`) and then the data bytes; on I²C, the register's address and then the data, a read after a
repeated START. In **Try it**, a link to an FPGA node made from a map says its accesses in the console's lines:
`write duty = 0xa5`, `read count → 0x0123`, when the run stops (after each SPI and I²C link's transfers). The
**regs-avr** example shows it: its FPGA module, `pwm_top`, instances the slave of the map `pwm_regs.regs.json`
(`duty`, the PWM of LD0, its bits on LD7..LD1; `count`, the milliseconds since `clear`; `clear`, a strobe); the
Arduino writes `clear` once, then every 47 ms or so writes `duty` with a count and reads `count`, its low byte on
D2..D7.

## Try it

**Try it** in the System editor's toolbar opens its simulation view under the canvas, the green Try it panel. **Run 100 ms** (or Run, then
Pause) runs the whole System together: the FPGA nodes' modules compiled (Yosys) for the compiled engine at their board's
clock, the Arduino's firmware run by avr8js at 16 MHz, everything in a Web Worker, deterministic. It shows:

- **the link inspector**: each wire of each link (a UART link is two: one each way) with its decoded bytes, their text
  and, on each byte, its time;
- **a terminal** for each terminal node: what it received, and a line typed there sent with Enter;
- **Waves**: the whole System's waves in the waveform viewer, a scope a node and one for the links.

The nodes' warnings (an AVR's byte lost, a framing error) are in the console. The AI assistant does the same with the
MCP server's `edit_system`, `check_system` and `simulate` (a System project's System; its waves written to
`build/<name>.vcd`).

## Emulate

**Emulate** in the System editor's toolbar (or **Emulate System** in the System row's menu in the Design pane) opens
the System Emulator in a tab of its own:
- each FPGA node's board is drawn as the Board Emulator draws it, and an Arduino as Silinx draws it, side by side;
- **Run** runs them all together in real time, and **Pause** stops them;
- click a switch or a button on an FPGA board: its module sees it as on the real board;
- an FPGA board's LEDs and displays light as its module drives them;
- an Arduino's pins show their levels (lit high, dark low, hollow floating) and its LED L lights with D13;
- each serial terminal is in the **Terminals** panel: type a line, Enter sends it.

The status line shows the time and how fast the boards run against real time.

## Try it: the uart-avr example

1. New Project ▸ **System**, Start from **Example: uart-avr**, Finish. Its System opens: `uno` (an Arduino Uno with
   `firmware/hello.hex`) linked by `serial` to `fpga` (the `uart` module on a Basys2).
2. **Try it**, then **Run 100 ms**. In the link inspector, `serial_uno` (the Arduino's TX to the FPGA's RX) shows
   `Hello from Arduino!` and `serial_fpga` (the FPGA's TX back) the same text: the FPGA echoes each byte.
3. **Waves**: the Arduino's D1 and D0, the FPGA's rx and tx, and the two wires, over the 100 ms.

The firmware's source is `firmware/hello.asm`: it sends its greeting, then shows each byte it receives on port B.
