# Co-design: an FPGA and a microcontroller together

[User's guide](README.md) · English · [Português](../pt/codesign.md)

A **co-design project** is a system of FPGA and microcontroller nodes linked together, designed and simulated as one:
an FPGA module of the project on its board, an Arduino Uno or Nano running its firmware, a serial terminal, joined by
UART and GPIO links. Its design is in [CODESIGN.md](../../CODESIGN.md); its roadmap is #4695.

## A co-design project

- **New Project ▸ Co-design.** It has no board of its own: each FPGA node of its System names its board and pins, each
  microcontroller its firmware. Start from **Empty** (its System, `<name>.sys.json`, with no node yet) or from the
  example **uart-avr** (an Arduino and the `uart` example's FPGA linked by UART).
- **Its System** is its top, shown in the Design pane as `<name> [System]`, the FPGA nodes' modules under it. It opens
  in the **System editor**: the tools place an FPGA node, an Arduino Uno or Nano, a serial terminal; **Link** joins two
  interfaces of one kind (a click on one, then on the other); the Properties panel sets a node's module, board and pins,
  a microcontroller's board and firmware (an Intel HEX, `.hex`, or avr-gcc's `.elf`; an `.elf` in the browser edition
  needs a workspace folder, its storage keeping text files only), an interface's TX and RX ports, baud and frame.
- **Its check** says its errors and warnings in the console as it is edited, and Check writes them in the Console: a
  module's port that is no port of it, TX and RX crossed, different bauds at the two ends of a link, a node that joins
  nothing, and a 5 V output on a 3.3 V FPGA input (an Arduino's TX on an FPGA's RX: on the real boards, a level shifter
  or a divider).

## Try it

**Try it** in the System editor's toolbar opens its simulation view under the canvas, the green Try it panel. **Run 100 ms** (or Run, then
Pause) runs the whole System together: the FPGA nodes' modules compiled (Yosys) for the compiled engine at their board's
clock, the Arduino's firmware run by avr8js at 16 MHz, everything in a Web Worker, deterministic. It shows:

- **the link inspector**: each wire of each link (a UART link is two: one each way) with its decoded bytes, their text
  and, on each byte, its time;
- **a terminal** for each terminal node: what it received, and a line typed there sent with Enter;
- **Waves**: the whole System's waves in the waveform viewer, a scope a node and one for the links.

The nodes' warnings (an AVR's byte lost, a framing error) are in the console. The AI assistant does the same with the
MCP server's `edit_system`, `check_system` and `simulate` (a co-design project's System; its waves written to
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

1. New Project ▸ **Co-design**, Start from **Example: uart-avr**, Finish. Its System opens: `uno` (an Arduino Uno with
   `firmware/hello.hex`) linked by `serial` to `fpga` (the `uart` module on a Basys2).
2. **Try it**, then **Run 100 ms**. In the link inspector, `serial_uno` (the Arduino's TX to the FPGA's RX) shows
   `Hello from Arduino!` and `serial_fpga` (the FPGA's TX back) the same text: the FPGA echoes each byte.
3. **Waves**: the Arduino's D1 and D0, the FPGA's rx and tx, and the two wires, over the 100 ms.

The firmware's source is `firmware/hello.asm`: it sends its greeting, then shows each byte it receives on port B.
