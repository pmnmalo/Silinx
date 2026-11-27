# Project modes: Circuit, Board, System

[User's guide](README.md) · English · [Português](../pt/modes.md)

Every Silinx project is in one of three **modes**, each a step on from the one before. **New Project…** asks the mode
first, with three cards, and a project can move to another mode later with **Project ▸ Change Mode…**.

| Mode | What it is for | What it shows |
|---|---|---|
| **Circuit** | Elementary components with no board: gates, flip-flops, circuits on a breadboard, schematics, truth tables, state machines, ASM charts, Petri nets, drawn and simulated. | Its drawings and their simulation. No board, no constraints, no synthesis or implementation, and no HDL shown (each drawing still makes its HDL, hidden). |
| **Board** | Exactly one board, with its own flow, emulator and programming. The board is an FPGA board (its design synthesized, implemented and programmed as a bitstream) or a processor board: an Arduino Uno or Nano, the Explorer 16/32 (PIC24), a Raspberry Pi Pico or Pico W, an ESP32 DevKitC (its firmware built and run). | An FPGA board: the sources, the constraints and the whole flow, the Board Emulator. A processor board: its firmware, and its board's Emulate, Simulate and Program. |
| **System** | Several devices linked by UART, SPI, I²C or Pmods: FPGA boards, microcontrollers, a serial terminal, circuits. | Its System document (the nodes and their links, drawn), each node's files in its folder, and the System's simulation and emulation (see [Systems](systems.md)). |

## Starting a project

- **Circuit**: an empty project (its top a drawing: a schematic, a state machine, a truth table, a circuit…), or one of
  the Circuit examples, made with no board: **gates** (logic gates drawn as a schematic), **breadboard** (74LS chips
  wired on a breadboard), and the Circuit versions of four FPGA examples, drawings only, each with a test bench that
  checks it: **traffic-circuit** (the crossing's state diagram and lamps' truth table, its timer a counter of the
  palette), **blinky-circuit** (a knight rider: a counter, XOR gates and a decoder), **stopwatch-circuit** (two decade
  counters, each a counter and a comparator, started and stopped by a T flip-flop) and **lock-circuit** (the
  combination lock: a state diagram, a truth table, an ASM chart, a Petri net and a 74LS175 on a breadboard).
- **Board**: its card asks the **Board Type**, FPGA, Arduino, PIC24, Raspberry Pi Pico or ESP32, and the settings page
  lists that type's boards. An FPGA board makes the FPGA project of every release before (start it empty or from any
  FPGA example, blinky, pong, uart…). A processor board needs no FPGA field, and the project starts with a firmware that
  blinks the board's LED
  (an assembly program for an Arduino, a MicroPython or CircuitPython one for a Pico, MicroPython for an ESP32; the
  PIC24 starts with none: its `.hex` is MPLAB X's). Select the board's row in the Design pane for its **Emulate Node**,
  **Simulate Node** and **Program Node**.
- **System**: an empty System, or a System example (uart-avr, spi-avr, i2c-avr, regs-avr, uart-fpga-pic24, adc-pmod,
  uart-fpga-pico, uart-fpga-esp32: named uart-pic24, uart-pico and uart-esp32 before, names that still open them, in a
  link too).

Systems, and with them the processor boards, are in the development build until they are stable.

## Changing the mode

**Project ▸ Change Mode…** shows the three cards with the project's own checked. Choose another and the dialog says
what the change does before anything is done:

- **Going up loses nothing.** A Circuit project given a board becomes a Board project (its constraints file written
  from the board's pins). A Board project becomes a System: its board is the System's first node, its files move into
  the node's folder (`fpga/`, a System builds each node from its own folder) and its System document is written. Add the
  other devices to it in the System editor.
- **Going down is allowed, with a warning** listing each thing lost: a System down to a Board keeps one of its FPGA or
  microcontroller nodes (the first FPGA, or the one chosen) and loses the others and the links; a Board down to a
  Circuit loses its board, its constraints file and the HDL sources no drawing makes. Each loss is also a warning in the
  console.

Nothing is ever deleted: what leaves the project stays in its folder on the disk, and a version of the project is kept
just before the change (**Project ▸ Versions…** restores it). A Board → System → Board round trip gives back the same
board, top module and constraints.

A processor board's firmware is no drawing, so its project does not go down to Circuit.

## Projects made before the modes

They open as they are, with nothing to convert: a design and simulation project ("Digital Logic") is a Circuit
project, an FPGA project a Board project, an Embedded / SoC or System project a System project. Their files are not
touched. A System's finer setting, Embedded / SoC or System (the kinds of nodes it allows), stays in **Design
Properties**.

## For an AI assistant

The MCP server does the same ([Silinx for an AI assistant](ai-mcp.md)): `new_project` takes `mode` (`circuit`,
`board`, `system`) and a processor board as its `board`; `new_project_from_example` takes `mode circuit` for a Circuit
example; `list_examples` gives each example's modes; `set_design_properties` with `mode` changes a project's mode, a change down only with
`confirm`, the refusal saying what would be lost; `project_info` and `list_projects` give each project's mode.
