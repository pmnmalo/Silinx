In short:

- **A System's Emulate:** in the Silinx interface, the Emulate task of a System project shows the System and its nodes as
  a tree. It used to say "No top module is set". Each node has its own **Emulate Node**, which runs it alone. **Emulation
  Properties…** chooses which nodes Emulate System runs.

In detail:

- **The Emulate task of a System project (#5581, part 1 of 4):** its panel shows the System's tree
  (`web/js/system-emulate-ui.js`, drawn by `web/js/processes.js`).
  - The System's row has Emulation Properties… and Emulate System.
  - Each node's row has its processes: an Arduino's or a PIC24's firmware (opens it) and Compile Firmware, a circuit's
    circuit, and Emulate Node. A terminal runs with the nodes it is linked to.
  - The panel's bar has Emulate System. Its I/O Pin Planning is off: an FPGA node's pins become a constraints file in its
    folder in part 2.
  - The ISE style's Processes panel has Emulation Properties… on the System's row and Emulate Node on each node's row.
- **One System Emulator runs the nodes chosen** (`core/system-alone.js`, `web/js/system-emu-open.js`):
  - Emulate System runs the nodes the Emulation Properties tick, and Emulate Node runs that node alone, in the same
    document. Its tab says which ("Emulate (uart_avr: fpga)").
  - The System is cut to those nodes. A link to a node that does not run has its open end replaced: a UART's end
    becomes a serial terminal, at the link's baud and frame. A GPIO, SPI or I²C end is left open. A circuit whose boards
    do not all run is not run.
  - Each replaced end is a warning in the console, for example `WARNING: Emulate Node fpga: link serial: uno is not
    run, its end fpga.uart is the terminal serial here (9600 baud, 8N1)`.
- **The Emulation Properties are the project's** (Pedro's decision): `silinx.json`'s `system.emulate.nodes`, left out
  when every node runs. A node removed from the System since is dropped.
- **MCP (#2674):**
  - `simulate`'s `top` takes `#a,b` (or `<file>.sys.json#a,b`): the System's nodes a and b alone, with the same
    warnings. With `controls`, a System runs the Emulation Properties' nodes, as Emulate System does.
  - `set_process_properties` takes `emulate_nodes` (`[]`: every node).
  - The tool's description is shorter, to keep tools/list under its budget (#5520).
