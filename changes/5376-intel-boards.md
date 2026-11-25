In short:

- **Intel (Altera) boards, experimental (#5376):** Terasic's DE10-Lite (MAX 10), DE0-CV, DE1-SoC and DE10-Nano (Cyclone V),
  DE0-Nano and DE2-115 (Cyclone IV E) in New Project and Design Properties, their constraints in Quartus's form (QSF);
  no implementation yet: the Silinx toolchain's Cyclone V flow and Quartus Prime come next.

In detail:

- **The Intel (Altera) FPGAs' boards and devices, phase 1 of the Intel roadmap (#5376):** the MAX 10, Cyclone IV E and
  Cyclone V families (core/devices-intel.js: the 10M50DA, EP4CE22, EP4CE115, 5CEBA4, 5CSEMA5 and 5CSEBA6, their LEs, ALMs,
  M9K / M10K blocks, multipliers, PLLs and their package's user I/O from Intel's device overviews and handbooks, named as
  Quartus names them: 10M50DAF484C7G, 5CEBA4F23C7) and the six DE boards (core/boards-intel.js: the clocks, LEDs, switches,
  keys, seven-segment displays, VGA, GPIO and Arduino headers, the DE2-115's LCD, RS-232 and PS/2), every pin from the
  tables of Terasic's user manuals, cross-checked against Terasic's golden-top .qsf files, each pin's I/O standard as
  Quartus names it ("3.3-V LVTTL", "2.5 V", "3.3 V SCHMITT TRIGGER"). Experimental families: marked so in New Project and
  Design Properties, their synthesis tool locked, a process tree of the constraints and the checks (Emulate too), and
  Implement refused with the reason (the 5CEBA4 (Cyclone V, an experimental family) has no implementation flow yet: its
  boards and its QSF constraints only (the Silinx toolchain's flow and Quartus Prime come next)). Their constraints are a
  QSF (set_location_assignment, IO_STANDARD, WEAK_PULL_UP_RESISTOR; the clocks in create_clock comments, written into the
  SDC Quartus reads): New Source, the QSF Wizard, I/O Pin Planning (Quartus's I/O standards, the pull-up), Update
  Constraints and Check Constraints (a pin twice, a pin of no ball, a pin on no resource of the board, an I/O standard of
  another voltage than its bank's or not the family's, a name no port, the ports with no pin). The devices named as
  Quartus names them in the console and the generated files (Device set to 5CEBA4F23C7). The MCP server: list_devices,
  new_project, set_design_properties (an Intel speed grade, c7, as it is), new_source, constraints_wizard,
  check_constraints, run_process's refusal. The Board Emulator draws the boards as rows of parts (their LEDs, switches and
  keys; the displays, one port each, not emulated yet). Tests: qsf (Terasic's lines read, the writer, the SDC, the part
  names), boards-intel (every pin against the manuals' tables, test/fixtures/terasic; the I/O standards; each board's QSF
  checked clean; a project on the DE0-CV), mcp-intel; UI intel-boards in both interfaces and Portuguese.
