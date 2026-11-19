# Every feature, in detail

[User's guide](README.md) · English

The reference: every feature of Silinx, with the menu that has it and the issue that made it. The [user's guide](README.md)
shows them one subject at a time.


A reprogrammable-hardware design platform in the style of the **Xilinx ISE 14.x Project Navigator**,
for Xilinx FPGAs supported by ISE 14.7.

- **Projects** made of **VHDL and/or Verilog** modules (mixed language), with *Implementation* /
  *Simulation* roles, implementation and simulation tops, UCF constraints, and ISE project
  import/export (`.zip` with the `.xise` and all files; a Silinx project from its `.zip` or its folder, the one with
  its `silinx.json`, #3965). Its *Project Kind* (New Project, Design Properties, #4103) is an FPGA design or a design
  and simulation project (no FPGA): no board, no constraints, no HDL shown, its Implementation view called Design
  (#3891); Design Properties also changes the *Top-Level Source Type*, Petri Net, Digital Electronic Circuit, C and C++ among them (#4105).
- **HDL editor**: syntax highlighting, context-aware auto-complete (signals, ports, constants,
  project modules, `numeric_std` functions, `$system` tasks), *Language Templates*, live errors,
  type tooltips, *go to definition* (Ctrl/Cmd+click, F12), *Rename Symbol* (F2: a signal, port,
  variable, type, label… renamed everywhere it means the same object, a port also in the instances
  of the other files; one Undo), *quick fixes* of errors (in the error's tooltip, its row of the
  Errors tab, Ctrl/Cmd+.: a misspelt name, an undeclared signal, a missing `;` / `end`, a width
  mismatch, a missing `use`, `wire` / `reg`…), folding, comment toggling (Ctrl+/), find/replace.
- **Beginner help for messages and design checks**: the common errors (missing `;` / `end`,
  undeclared signal, std_logic vs std_logic_vector, widths, input assigned / output read in
  VHDL-93, missing `use ieee.numeric_std.all`, unknown module, port map, a signal with several
  drivers (an error, as XST's *Multi-source*)…) keep their ISE-style
  message and get an *Explanation* and *How to fix* (English / Portuguese), expandable in the
  Errors / Warnings tabs and in the editor tooltip. Check Syntax and the live editor also run
  design checks: latch inferred, incomplete sensitivity list, combinational loop,
  output never assigned, input / signal never used, clock used as data / logic used as clock,
  `=` / `<=` in the wrong Verilog always block, case without `others` / `default`, integer without
  range. Turn the warnings off with *Edit ▸ Design Checks*, or one line with a comment
  `-- silinx: ignore latch` (`// silinx: ignore sensitivity`, or `silinx: ignore` for all).
- **RTL schematics**: the design drawn in the schematic editor, read-only, with sub-instances you
  push into with a double-click.
- **Schematic editor** (ISE Schematic Editor style): gates, muxes, adders/comparators, counters,
  flip-flops and registers, bus slices/joins, constants, I/O markers and any project module as a
  symbol (symbols and I/O markers rotated and mirrored: Ctrl+R / Ctrl+M); wires, buses and net
  names; Check Schematic. A rectangle dragged with the Add I/O Marker tool gives every open pin in it a marker (`in1`…,
  `out1`…, `io1`…, #4000). An instance's *Width* (Properties) makes it an array of copies, as ISE's (8: `r(7:0)`, drawn
  as one, #3950): its pins buses N times as wide, the wires connected to them adapting (#4451), its inputs ticked in
  *Shared pins* shared by every copy (#3966, #4053). The ⋮ menu's *Wires* draws them *Direct* (straight lines), *Orthogonal* (the
  technical drawing, the default) or *Curved*: the look only, each wire keeping its horizontal and vertical path,
  what it connects (and ISE's `.sch`); its *Wire crossings* are *Hop-overs* (the default) or *Plain crossings*, in the
  schematic viewer, the RTL schematic and the circuit editor too (#4101). *Settings ▸ Schematic Symbols* draws the gates, inverters and buffers in
  IEEE Std 91-1984's distinctive shapes (the default, as ISE) or IEC 60617-12's rectangles (`&`, `≥1`, `=1`, `1`, a
  bubble for a negation), here and in the RTL and technology schematics: the pins where they are, the files the
  same. A schematic always has its VHDL/Verilog file,
  generated from it: the schematic is the base, and an edit of the HDL updates the schematic (the
  drawing is kept when the structure does not change). Any HDL module can be converted to a schematic
  (*Convert to Schematic*), with processes and other behavioural code kept as HDL blocks: its HDL is
  then generated from the schematic and compiles and simulates as the module did.
- **Tri-state buffers** (palette category *Tri-State*): BUFE (enable E active high, O = E ? I : Z)
  and BUFT (T active low, as in Xilinx), 1 bit or a bus of any width, a pin per bit as an option (BUFE4,
  BUFT8… as in Xilinx). Several tri-state outputs
  (and inout markers / inout pins of modules) may drive the same net, a bus; an ordinary output
  together with a tri-state output is still an error. The HDL is
  `O <= I when E = '1' else (others => 'Z');` / `assign O = E ? I : {N{1'bz}};` on resolved
  std_logic nets, read back as tri-state buffers by *Convert to Schematic*; ISE `.sch` BUFE / BUFT
  symbols import to it and export back; the live simulation shows a released bus as Z (blue) and
  two buffers driving different values as X (red).
- **Symbol Info** (like the ISE Symbol Info / Libraries Guide pages): a datasheet for every symbol
  of the schematic library and its presets (gates and inverted-input gates, muxes, demuxes,
  decoders, encoders, tri-state buffers (function table with Z), ADD/SUB/COMP, constants, FD*/FT*/FJK* flip-flops, registers, counters, bus
  taps/joins, modules, HDL blocks), in English or Portuguese: description, symbol drawing, pin table,
  parameters, truth table computed by simulating the symbol's own HDL (compact form with X, or
  representative rows for wide symbols), Xilinx-style mode table for sequential symbols, equivalent
  VHDL and Verilog, and the Xilinx library names it stands for. Open it with *Symbol Info* (toolbar
  or F1) on a selected or palette symbol, the palette right-click menu, *More…* in the palette info
  box, or the Properties panel; change parameters in the dialog to watch the tables update.
- **Live schematic simulation** (Logisim style): *Simulate* in the schematic editor runs the drawing
  itself. Click the input markers: 1-bit inputs are switches, buses open a value editor (hex /
  binary / decimal, +1 / −1), clock inputs step one cycle or run at 1 Hz … 1 kHz; *Reset* power-cycles.
  Wires are coloured by value (green 1, dark green 0, red X/U, blue Z), buses show their value,
  outputs light up, flip-flops / registers / counters show what they store, hovering a pin or wire
  shows its value and clicking a module instance lists its pin values. Module symbols simulate their
  project HDL; schematic errors refuse the simulation with the list of errors. Esc returns to editing.
- **ISE schematics (.sch)**: schematics in ISE projects (XML and older text formats) are converted
  on import, with the Xilinx library symbols mapped to equivalent symbols or exact HDL blocks;
  exporting a project writes them back as ISE `.sch` files, arrayed instances and edited symbols kept both ways (#3828).
- **Graphical ASM state-machine editor** (state, decision, case and conditional-output boxes)
  that generates synthesizable VHDL or Verilog (2/3-process style, binary/gray/one-hot/enum
  encoding, chosen in the toolbar's ⋮ menu, #4055) and adds it to the project. Its toolbar starts with a select arrow,
  and an add tool (state, decision, case…) stays on until Escape or the arrow (#3971). A *case* box is a multi-way decision on the value of a
  signal (e.g. an `opcode`), one exit per value (`00100`, `0|1`, `others`), generated as a
  `case` statement; conditions can test bits and slices (`opcode[4]`, `opcode[4:3]`).
  Charts and schematics print on one page or tiled over several, or save as PNG / SVG.
  *Try it* steps through the chart: set its inputs (and its reset), apply clock edges (one, or *Run* at a chosen
  rate; *Back* undoes one), and see the present state, the decisions tested and the exits followed, the conditional
  outputs reached and the next state drawn on the chart, its Moore and Mealy outputs, its registers and their next
  values, and the last cycles, exactly as its generated HDL behaves.
  The chart always has its HDL file, generated from it (an edit of the HDL updates the chart), and
  an HDL state machine (1/2/3-process, VHDL or Verilog) can be converted to a chart (*Convert to
  State Machine*).
  A chart can also hold the data path of a small controller: integer generics, internal
  registers, 2-flip-flop input synchronisers, `<<`/`>>`, and *every cycle* blocks (decision and
  output boxes evaluated on every clock cycle, in parallel with the states), e.g. the blinky
  example's `speed_ctrl.asm.json` (button synchronisers + debouncers + speed FSM + step divider).
- **Board emulator** (*Emulate on Board ▸ Emulate Behavioral Model (RTL)*): the design runs on a drawing of the real kit
  (Digilent Basys2, Nexys2, Nexys3, Atlys, Basys 3 and Nexys A7, Spartan-3E Starter Kit, 1BitSquared iCEBreaker; a generic panel
  for the other boards: the ULX3S, the Tang Nano 9K, the Arty S7, the Zybo Z7…),
  wired by the constraints (UCF, XDC, PCF, LPF or CST): click the slide switches, press the buttons, watch the LEDs and the
  multiplexed 7-segment display (persistence of vision), at a chosen clock rate, with a watch list
  of internal signals. It works without ISE and in the standalone edition. Two engines: the design
  **compiled** (its netlist, read by Yosys, as one JavaScript function per clock cycle: tens of
  millions of cycles per second, the board's real speed with the real timing generics), or, to
  debug (X values, the design's messages) or when it cannot be compiled, the **event-driven**
  simulation of the HDL, its large timing generics divided so that it visibly runs (the default on
  a phone, a tablet or a computer of few cores, where it starts at once; the engine chosen is remembered). With the
  compiled engine, a **VGA monitor** shows the 640×480 picture the design scans out on the board's
  VGA connector, its sync timing measured (line period, frame rate, lines, pulses, polarities) and
  what is not 640×480 at 60 Hz pointed out.
  It can also run what the tools built: the post-synthesis, post-translate, post-map and post-place &
  route netlists (the Silinx toolchain's own, or ISE's netgen), on the board or in SSim, the Silinx
  toolchain's post-place & route netlist in SSim with its timing (its SDF: the delays, the glitches a
  gate filters, the setup checks), with Silinx's own models of the
  UNISIM / SIMPRIM primitives (functional): LUTs, flip-flops, latches, carry
  logic, SRLs, distributed and block RAM, multipliers, clock buffers and DCMs (CLK0/90/180/270,
  CLK2X, CLKDV and CLKFX at their real frequencies).
- **ISE processes** beyond the main flow (all of them with the Silinx toolchain too, the Text Power
  Report as an estimate): View
  Technology Schematic (the post-synthesis netlist, regrouped by the design's modules), Generate Post-Synthesis / Translate / Map / Place & Route
  Simulation Model, Post-Place & Route Static Timing, Text Power Report (xpwr), Back-annotate Pin
  Locations (pin2ucf, merged into the UCF).
- **Behavioural simulation** with Silinx's own simulator, SSim (the Silinx Simulator), written from scratch in JavaScript:
  4-state logic, delta cycles, VHDL/Verilog testbenches (`wait`, `#delay`, `assert`/`report`,
  `$display`, `$readmemh`…), a waveform window in the style of Xilinx's ISim (dividers, groups of signals), force/clock to
  simulate modules without a testbench, its wave configuration saved and loaded as a file of the project (.wcfg, as ISim's).
- **Stimuli drawn on the waveforms**, as the HDL Bencher (Test Bench Waveform) of the old ISE: simulating a
  module without a test bench, *Edit Stimuli* in SSim lays its inputs out as a grid of cycles (a clock and its
  period, or combinational with a time step). A click on a cycle of an input changes it there and up to its
  next change (0 → 1 → Z → X; a bus gets a value typed in) and the simulation runs again at once. Expected
  outputs, clicked in or filled in from the simulation, are checked (mismatches in red). Simulating a test bench,
  it draws the inputs of its unit under test, over what the bench drives them with. The stimuli are saved
  in the project and run when SSim opens; *Save as Test Bench…* writes them as a self-checking VHDL / Verilog
  test bench.
- **Test Bench Wizard** (*New Source ▸ Test Bench ▸ Wizard >*, or right-click a module): writes a
  self-checking VHDL or Verilog test bench for a module. Input vectors: every combination of the
  inputs (exhaustive), random, counting, walking ones/zeros, or typed in; clock and reset detected
  (sequential designs get one vector per clock cycle). The expected outputs of each vector are
  typed in (what the design should do) or filled in from a simulation of the current design (a
  regression test); `-` bits are not checked. The bench reports every mismatch with its inputs and
  ends with *TEST PASSED* / *TEST FAILED*; it is VHDL-93 / Verilog-2001, so it also runs in Xilinx's ISim.
  **Bidirectional (inout) ports** get two columns: what the bench *drives* on the bus (a value, like
  an input; `Z` or empty releases it so that the design can drive it — per bit, e.g. `ZZ01`) and the
  value *expected* on the bus (checked like an output). The bench declares a resolved signal
  (`std_logic(_vector)` initialised to `'Z'` / a Verilog `wire` driven by a `reg` holding the value
  or `z`). The generated vectors (exhaustive, random, counting, walking) come in pairs: the bench
  drives the port like an input, then releases it (`Z`) with the same inputs so that the value the
  design drives is checked; any row can be changed by hand.
- **New Source types**: *Boolean Algebra*, *Digital Electronic Circuit*, *Module (HDL)* (the ISE Define Module page: language, entity/module and
  architecture names, a port table), *Schematic* (a blank sheet), *Finite State Machine (FSM)*, *Algorithmic State
  Machine (ASM)*, *Petri Net*, *Clock Manager (DCM / PLL)*, *Block Memory*, *Test Bench*, *Implementation
  Constraints File*, *Memory Initialization File (.mem)*, *C Function (HLS)*, *C++ Function (HLS)*. Page 2 is the same for every type: the file name, the
  location and the language (VHDL / Verilog, the project's preferred language by default), with the buttons
  *Wizard > | < Back | Next > | Cancel*: *Next >* makes the plain source, *Wizard >* opens the type's wizard (Boolean
  Algebra, Module, Schematic, FSM, ASM, Petri Net, Test Bench, Clocking Wizard, Block Memory, UCF) at its own pages,
  with that name, location and language, and its *< Back* on the first page goes back to New Source to change them;
  *Wizard >* is disabled for a type that has none, and *Next >* for a type that has only the wizard (Clock Manager,
  Block Memory).
- **Digital circuits** (*New Source ▸ Digital Electronic Circuit*, its wizard's typical assemblies; a new project's top, [docs/CIRCUITS.md](circuits.md)): real ICs (74LS gates, open collector
  ones too, and 4000 gates; the MSI ICs, 7447 / 7448, 74138 / 74139, 74151 / 74153 / 74157, 7483 / 74283, 7485; the
  sequential ones, 7474, 7476, 74112, counters 7490 to 74193 and 4017, shift registers 74164 to 74595, the 4511, #3900:
  their datasheets' pinouts), switches (logic, slide, DIP), push buttons, a clock, pull-ups, LEDs,
  7-segment displays and LED bars wired on a breadboard or beside it, simulated
  live with the gates' delays (*Try it*: a click flips a switch, the LEDs light, each pin shows its level); its *Check*
  says the short circuits, the unpowered ICs and the floating inputs. Its parts are in the *Parts* panel on the left,
  each drawn, an IC as its schematic symbol, with a search (#4062); *Show inside* draws the gates inside each IC and
  the strips of each breadboard (#4060); *Keep connections* keeps the wires on a part moved or turned, a breadboard
  carries the parts plugged into it, every part turns whole, its labels upright, and parts are copied and pasted (#4059,
  #4114); the ⋮ menu has *Curved wires* and the wire crossings (#4064, #4101); *Try it* has its own bar, with *Reset*
  and *Stop* (#4067). Its HDL is generated, one entity per IC; logic probes;
  its waveforms its test bench's, simulated as any module's. A circuit can be an FPGA project's top, its switches and LEDs the board's
  (`led[0]`, `sw[0]`: a vector port); its HDL's digital model is what synthesis builds (the *breadboard* example).
- **Boolean Algebra Wizard** (*New Source ▸ Boolean Algebra ▸ Wizard >*): the names of the inputs (1–16) and of the
  outputs, or an expression (`F = A·B' + C`) whose variables are the inputs and whose name the output, its column
  filled in.
- **Templates** of the FSM, ASM and Petri net wizards (their first page, *Template*; `core/chart-templates.js`): they
  fill in the next pages, which can still be changed. FSM: a counter of N states (its count on q), up/down (`up`), with
  an enable (`en`), a ring (one-hot) and a Johnson counter, a sequence detector (a bit pattern, overlapping or not,
  Moore or Mealy), a traffic light; ASM: a counter, an up/down counter, a start/done controller, a req/ack handshake;
  Petri net: a cycle of N places, producer/consumer with a buffer of N, mutual exclusion of two processes, fork/join,
  a semaphore of N resources for M users.
- **FSM Wizard** and **ASM Wizard** (*New Source ▸ Finite State Machine (FSM) / Algorithmic State Machine (ASM) ▸
  Wizard >*): the inputs and outputs (the port table, no quick-add buttons), the clock and the reset (an FSM: Moore
  or Mealy), then the states (an FSM's transitions too: from, to and a condition over the inputs, in priority
  order; an ASM's state boxes each followed by the next, the last by the first); it creates the chart and opens it
  in its editor, where the outputs and the decisions are drawn. Builder: `core/chart-wizard.js`.
- **UCF Wizard** (*New Source ▸ Implementation Constraints File ▸ Wizard >*): each bit of a module's ports (the
  top by default) on a pin of the project's board, assigned from the board as I/O Pin Planning's *Auto-assign*
  (by the names, then the inputs on the switches and the outputs on the LEDs) and changed in a list of the board's
  pins (with no board: the package pins typed); a pin given twice is refused; it writes the `.ucf`, the project's
  constraints file when it has none. On the other families it is the device's format's: the **PCF Wizard** (iCE40, a
  pull-up per pin), the **LPF Wizard** (ECP5), the **CST Wizard** (Gowin, each pin's I/O standard its bank's) and the **CCF Wizard** (GateMate), with
  the I/O standard, pull and drive their format writes; a pin that is no pin of the package, or an I/O standard at
  another voltage than its bank's on the board, is refused (Check Constraints says the same of a file edited by hand).
- **Module Wizard** (*New Source ▸ Module (HDL) ▸ Wizard >*), for beginners: the name, the location and the
  language typed on New Source; the inputs, outputs and bidirectional ports
  in a friendly table (name, input/output/bidirectional, width — 1 is a single bit, N a bus N-1
  downto 0 — and a description per port; only the user's own ports, added with *Add Port*) and checks (valid identifiers, no reserved word of the chosen language, no
  duplicates); the kind of logic: **combinational** (one assignment per output, or one process /
  `always @(*)` that reads every input with every output given a default — no latches) or
  **sequential** (clock, reset none / synchronous / asynchronous, active high or low, optional
  enable; the registered outputs reset to 0, a TODO comment where the next-state logic goes), and
  optional integer generics; a description (it goes into the header comment); a summary with a preview of the
  code. The file is written to `src/`, added to the project and opened; it compiles as generated (VHDL: `ieee.numeric_std`, entity,
  `architecture rtl`; Verilog: ANSI ports, `reg` for the registered outputs). A **bidirectional
  (inout) port** gets the tri-state pattern, commented: an output enable `<port>_oe` and a value
  `<port>_out` (internal signals, with a TODO for the condition; `'0'` = released until written),
  the driver `data <= data_out when data_oe = '1' else (others => 'Z');` /
  `assign data = data_oe ? data_out : 8'bz;`, and the bus read from the port itself. Generator:
  `core/modgen.js`.
- **Clocking Wizard** (*New Source ▸ Clock Manager (DCM / PLL) ▸ Wizard >*): a module with the target device's clock
  manager, a DCM_SP on the Spartan-3E, a PLL_BASE on the Spartan-6, for the frequencies asked: the
  input clock (the board's oscillator by default; from a pin through an IBUFG or not), the reset and
  LOCKED; on the Spartan-3E the DCM's outputs (CLK0 / 90 / 180 / 270, CLK2X / 2X180, CLKDV, CLKFX /
  FX180), the input divided by 2 and a fixed phase shift; on the Spartan-6 up to six outputs with a
  phase each. Each output shows the frequency it gets (the nearest the primitive can make: CLKDV's
  divide, CLKFX's multiply / divide, the PLL's VCO and dividers, within DS312's / DS162's ranges)
  and the ones near it it can make (a click asks for one). It writes the module (VHDL or Verilog)
  with the primitive and a BUFG per output, its parameters computed and commented, and its settings
  in a header line: the Design pane shows it as *[Clocking Wizard] [VHDL]*, and a double-click, the
  badge or *View/Edit Clocking Wizard* reopen the wizard with them. Generator: `core/clocking.js`.
- **Block Memory** (*New Source ▸ Block Memory ▸ Wizard >*): a RAM or a ROM of the target device's block RAMs, width ×
  depth, one port or two (each with its own clock), read-first or write-first, its initial contents from a
  `.mem` (hexadecimal words, `@address`) or `.coe` file of the project. It shows the block RAMs it takes
  against the device's (Spartan-3E RAMB16s; Spartan-6 9 Kbit halves) and refuses one that does not fit. It
  writes the module with the primitives (RAMB16_S*w* / RAMB16_S*w*_S*w* on the Spartan-3E, RAMB8BWER /
  RAMB16BWER on the Spartan-6: the shape with the fewest blocks, side by side for a wider memory, in rows for
  a deeper one, the high address bits choosing the row), their INIT_xx from the file, or the inferable HDL (an
  array that synthesis maps to the same block RAMs). Like the Clocking Wizard's, the module shows as
  *[Block Memory] [VHDL]* and reopens the wizard (which reads the file again). Generator: `core/blockram.js`.
- **Schematic Wizard** (*New Source ▸ Schematic ▸ Wizard >*): a template first (Empty, or a register, a shift
  register, a counter, a modulo-N counter, a clock divider, a PWM, an edge detector, a synchroniser and debouncer, an
  adder-subtractor, an accumulator, a multiplexed 7-segment display, a full adder of gates: their symbols placed and
  wired), the same port table (no quick-add buttons) and
  a description; it creates the
  `.sch.json` with the I/O markers placed tidily (inputs on the left edge, outputs on the right,
  bidirectional markers on the right below the outputs, bus markers with their width), the
  description written on the sheet, and opens it in the schematic editor, ready for the symbols and
  wires. In the live simulation a bidirectional marker shows the value on the bus and can drive it
  from outside (click: Z → 0 → 1; a bus opens the value editor, *Z* releases it) — the circuit
  drives it through tri-state buffers (BUFE / BUFT) or a module symbol with an inout port.
- **Boolean Algebra / Karnaugh Map** (it was Truth Table; *Tools ▸ Boolean Algebra / Karnaugh Map…*, New Source ▸
  *Boolean Algebra (.bool.json)*): name 1–16 inputs (a table of more than 256 rows scrolls in its own box, its rows drawn as they
  come into view; a very long expression shown in part; the divider between the table and its expressions dragged left or right) and any number of outputs, click the cells (0 → 1 → X don't care)
  or type an expression per output (`ab' + c`, `a·b + c`, `/a.b + a./b`, `~a & b`,
  `(a and not b) or c`, `a ^ b`, `¬a ∧ b`, `a̅·b`…), the expressions shown in the notation of *Settings ▸ Boolean Notation*
  (*View ▸* in the ISE style interface), or the table's own, chosen in its toolbar's ⋮ menu and saved with it: Electronics / Engineering (`a̅.b + c`, the default; each NOT drawn as a bar over its group, a NOT inside a NOT a bar above the ones under it),
  text only (`/a.b + c`), logic (`¬a ∧ b ∨ c`), VHDL or Verilog — a state diagram's tables and the conditions a
  conversion writes (an HDL module, an ASM chart or a Petri net made a state diagram or a chart) too. For each output, the results, in this order: the least gates and the least delay (each its function,
  then its terms, literals and gates); the *Karnaugh map*'s simplified
  function (up to 6 inputs: past that the console says there is none), its minimal SOP or POS, whichever of *SOP* / *POS* is clicked,
  and under it, with its *Show K-map* button, the map (Gray order; the variables MSB → LSB by columns then rows, or by rows then
  columns, chosen beside the map; 5–6 inputs as two/four 4×4 maps, the most significant picking the map) with the groups of the minimal SOP
  (1s) or POS (0s), the result's, drawn as coloured rounded rectangles, wrap-around groups split at the edges; several minimal solutions
  browsed with *◀ Solution k of N ▶* beside the map, the one chosen used); *Quine-McCluskey*'s, SOP or POS, for every table (up to 16
  inputs), with its steps under its *Show Steps* button (the columns of the
  implicants combined, the prime implicant chart, the essential prime implicants, the cover: Petrick's method's minimum), exact while it is
  bounded, past that a cover heuristic (the console says it is not proven minimal);
  the canonical SOP and POS, each with its Σm / ΠM list beside its name and in full under it (the sum of the minterms, the product of the
  maxterms); each with its terms, literals and gates (named as its schematic draws them, `1 AND2B1, 2 AND3, 1 OR3`: an
  inverted input of an AND, OR, NAND or NOR, not a NOT gate, #4091) and its circuit (SdP / PdS in Portuguese). Each table's map can also be shown in 3D
  (3 inputs on a cylinder, 4 on a torus). After them come the *XOR form*, when it is simpler than both (fewer literals, or as many and fewer
  two-input operators): `a ⊕ b ⊕ c`, a full adder's carry `a.b + c.(a ⊕ b)`, a comparator's
  `/(a1 ⊕ b1)./(a0 ⊕ b0)`, `a ⊕ b·c` (sums of products of literals and XOR / XNOR factors, or a
  variable XOR one; up to 6 inputs, don't cares used, checked on the whole table); and the *NAND
  form* and *NOR form*, the minimal SOP with NAND gates only and the minimal POS with NOR gates only
  (double negation: `/(/(a.b)./(c.d))`), with their gate counts. The expressions are written in the notation chosen (above: here the text only one's, AND a point
  in it as in Electronics / Engineering, #4094); each reads back as typed. A tick box on
  each result picks that output's logic in the module and the schematic (its *HDL logic*; the least gates' by default):
  the least gates or delay, the Karnaugh map's SOP or POS, Quine-McCluskey's SOP or POS, the canonical SOP or POS, the XOR form where it is simpler
  (`xor` / `xnor`, `^` / `~^`), NAND gates only (`a nand b`, `~(a & b)`), NOR gates only. The table always has its HDL module, made with it in the project's
  preferred language, kept in sync with the table both ways (like ASM charts: editing the table
  rewrites it; editing and saving the HDL updates the table by exhaustive simulation, don't cares
  kept in its comments; a module that no longer fits — sequential, too many inputs — shows the
  reason in the editor banners).
  Its schematic is always drawn from it, in that logic (AND / OR / NOT gates, XOR / XNOR gates,
  NAND or NOR gates only): the *Schematic* badge of the table's row in the Design pane opens it
  (read-only, redrawn whenever the table changes). *Algebra from Module…*, in the toolbar's menu (⋮), fills the table with the table of any combinational module
  of up to 16 input bits (#3939).
- **Handwritten expressions** (*Handwritten Algebra…*, in the Boolean Algebra editor's menu ⋮): write one or more equations on a pad, one a
  line, with any names (`F = A·B' + C`, `G = A ⊕ D`), with a pen, a finger or the mouse — on an interactive
  whiteboard or a tablet too. Silinx's own recognizer reads them, offline (a point-cloud recognizer with built-in
  templates; nothing is sent anywhere): letters, digits, `_`, `+ · * ' ¬ ~ ( ) = ⊕ ^ & |`, and a bar over letters as
  NOT; the text is shown in the editor's notation (`F = /A.B + C`) for you to correct, and inserted, the equations
  become the editor's: its inputs, its outputs, their columns and expressions (one step of Undo). *Teach Silinx my
  handwriting* keeps samples of your own way of writing a symbol in the browser. On the pad, two fingers zoom and
  move the writing area, the mouse wheel zooms it, *Move* drags it with a pen or the mouse, *Erase* rubs out ink,
  *Fit* shows the whole drawing. The New Source wizard's *Boolean Algebra* takes a typed expression, which gives the
  table's inputs, its output and its column.
- **Handwritten tables and schematics, a preview** (development builds only, from the *Development* menu, while it
  does not read real handwriting well enough yet); the Handwritten Schematic dialog uses the whole page.
- **Hand-drawn truth tables** (a preview, *Development ▸ Handwritten Boolean Algebra…*, on the open Boolean Algebra): draw
  the whole table — the names in a header, a line under it, a line between the inputs and the outputs, a row of 0, 1
  or X for each combination — and Silinx reads it offline into its text (`A B | F`, then a row a line), which you
  correct before it fills the table.
- **Hand-drawn schematics** (a preview, *Development ▸ Handwritten Schematic…*, on the open schematic): draw a
  circuit — AND, OR, XOR gates, a triangle for a buffer, a small circle at a gate's output for NOT / NAND / NOR /
  XNOR, flip-flops as boxes with their pins written inside them (D, T, or J and K, the clock as C, CLK or a wedge, CE,
  CLR, PRE; Q and Q̄), square wires (looping back too), the inputs' and outputs' names at the wires' ends — and Silinx
  reads it offline: the gates and flip-flops are listed with their types and the names, to correct, then made into the
  schematic with Silinx's symbols where you drew them and the wires routed square (Undo brings the drawing before
  back).
- **State diagrams (FSM)** (*Tools ▸ FSM State Diagram Editor…*, New Source ▸ *Finite State Machine (FSM)*,
  `.fsm.json`): the bubble diagram of the 1st-semester courses, Moore or Mealy (Mealy when a transition has outputs). Double-click to add
  a state, drag from the rim of a state to another (or to itself) to add a transition, double-click
  to edit in place (`S2 / z=1` in a state, `x && !y / z=1` on an arrow), drag a label to bend its
  arrow (its toolbar starts with a select arrow, and an add tool stays on until Escape or the arrow, #3971); properties
  panel (initial/reset state, Moore outputs, condition, Mealy outputs, priority; the outputs one per line, #3882; a
  state's and a transition's *Look*: fill, border and its width, text colour, size, style and font, an arrow's colour, width and
  solid / dashed / dotted line, saved with the diagram, its HDL unchanged, #3883; Delete, the key or the toolbar's),
  conditions in any common notation (`x && !y`, `x & ~y`, `x AND NOT y`, Boolean algebra's `x.y'`, `x·/y`,
  `x + y`; comparisons `==`, `!=`, `<`, `>=`…) and `else` / `@else` (StateCAD's `@ELSE`) / `others` / `otherwise` /
  `default` / `true` / `1` for the state's otherwise transition, taken when no other one is (its Properties' *Else
  (every other case)* box; drawn *else* on its arc, #4489),
  inputs and outputs (bits and buses, default values), clock, reset (sync/async, active level),
  encoding (binary, gray, one-hot, enumerated), auto-layout, zoom/pan/fit, undo/redo, print / SVG.
  Plain-language checks: unreachable states, states with no exit, overlapping conditions (two
  transitions true at once: the first listed wins), incomplete conditions (the machine stays),
  transitions never taken, outputs never set, invalid names and expressions. *Tables*: transition
  table, classic state table and, for binary/gray, the encoded transition table (state bits, next
  state bits, outputs; unused codes as don't cares) — CSV export and *Create Boolean Algebra* of the
  next-state bits and outputs for the K-map exercise. Its HDL: readable VHDL or Verilog (2- or
  3-process style; changing the language in the editor makes it again in that one) kept in sync
  both ways like ASM charts (an HDL edit that is no longer a plain state machine shows the reason); *Convert to State Diagram (FSM)* reads an HDL module or an
  ASM chart, *Convert to ASM chart* goes the other way; *Try it* steps through the diagram (set
  the inputs, clock edges, current state and the transition about to be taken highlighted).
- **Petri nets** (*Tools ▸ Petri Net Editor…*, New Source ▸ *Petri Net*, `.pn.json`, `core/petri.js`): places (their
  initial tokens, a capacity, outputs while marked), transitions (a guard over the inputs, a priority, pulses when they
  fire) and arcs (a weight, or an inhibitor arc); *Try it* fires the transitions (the token game) or steps the clock, as
  the hardware does (every enabled transition whose guard is true, in priority order); its *Analysis* (bounded,
  deadlocks, live, reversible, conservative, the reachability graph) and PNML import and export in the ⋮ menu. Its HDL,
  VHDL or Verilog, is generated from it (a register per place, a counter where a place holds more than one token), and
  it converts to a state diagram.
- **Implementation** with the **Silinx toolchain** (the Basys2, Nexys2, Nexys3, Atlys, iCEBreaker, ULX3S, Tang Nano 9K and GateMate evaluation
  boards, the default; the Basys 3 and Nexys A7 too, an experimental family, AMD Vivado their default; in the
  browser or locally) or with **Xilinx ISE 14.7** (XST → NGDBuild → MAP → PAR → TRCE → BitGen), run
  locally, in Docker or over SSH, with live per-step status (✓ / ⚠ / ✗) in the Processes panel
  (restored when the project is reopened), *Stop*, every warning/error in the Warnings/Errors tabs,
  and utilization/timing reports in the *Design Summary*. Simulation and editing stay available
  while an implementation runs. Ports without a pin constraint get free I/O pins automatically when
  no board is selected (with a warning; with a board they must be assigned).
- **Devices**: every FPGA family ISE 14.7 WebPACK implements — Spartan-3, Spartan-3E,
  Spartan-3A/3AN, Spartan-3A DSP, Spartan-6, Virtex-4/5/6, Artix-7, Kintex-7 and Zynq-7000
  (WebPACK parts); the 7-series, the Spartan-7 too, are AMD Vivado's (#3895, [below](toolchains.md#the-artix-7-boards-with-amd-vivado)). Full flows verified to a bitstream on Spartan-3E and Spartan-6. Beyond ISE, the
  Lattice iCE40 (LP, HX, Ultra, UltraPlus) builds with the Silinx toolchain's nextpnr-ice40 and icepack, and the Lattice
  ECP5 (LFE5U, LFE5UM, LFE5UM5G) with nextpnr-ecp5 and ecppack (Project Trellis); the Gowin GW1NR-9C with
  nextpnr-himbaechel-gowin (Project Apicula) and gowin_pack, Silinx's JavaScript port of Apicula's (#2303); the Cologne Chip
  GateMate CCGM1A1 and CCGM1A2 with nextpnr-himbaechel-gatemate and gmpack (Project Peppercorn, #2431).
- **Boards and I/O Pin Planning**: Digilent Basys2, Nexys2, Nexys3, Atlys, Cmod S6; Xilinx
  Spartan-3E / Spartan-3A / Spartan-3 starter kits (the Spartan-3A's has no 7-segment display: ISE's build of an
  example that drives one puts it on its expansion headers, J18, J20 and FX2 J17, and says each pin, #3872); Numato
  Mimas V2 and Elbert V2; Papilio One; EDGE Spartan 6 (#3873); Digilent Basys 3, Nexys A7, Arty S7 and Zybo Z7 (#3895);
  1BitSquared iCEBreaker (iCE40, its pins written as a PCF; a 1BitSquared iCEBreaker + PmodVGA for VGA); Radiona ULX3S
  (ECP5, its pins written as an LPF; a Radiona ULX3S + VGA for VGA); Sipeed Tang Nano 9K (Gowin, its pins written as a CST; a
  Sipeed Tang Nano 9K + VGA for VGA); Cologne Chip GateMate FPGA Evaluation Board (GateMate, its pins written as a CCF; a Cologne
  Chip GateMate FPGA Evaluation Board + VGA for VGA).
  Ports are mapped to board resources by name, the UCF is generated, and pins are checked against
  the board before ISE runs (ISE's bitgen options are the family's: the Elbert V2's and the Spartan-3 Starter Board's
  bitstreams too, #3869).
- **View Implemented Design (FPGA)**: the placed and routed design inside the chip (from the Silinx
  toolchain's routing, or from ISE's `xdl`): sites coloured by module, LUT equations and flip-flops of each site, I/O pads, nets
  and their routing, the clock network; selecting a module in the Design hierarchy shows it on
  the chip and the other way round.
- **Two interfaces** (*View ▸ Interface*): the **Silinx** interface (the default: header with search, activity bar,
  tabs, labelled design-flow buttons, light and dark themes that follow the system, command palette with
  Ctrl+K / Cmd+K) and the **ISE style** interface, laid out as ISE's Project Navigator.
- **Internationalised interface**: English and Portuguese (*View ▸ Language*; the browser language
  is used by default). Translations live in `web/js/i18n.js`: adding a language is adding a
  dictionary. Code, tool output and design names are never translated.
- **Programming** (iMPACT-like): the FPGA (volatile) or the board's Platform Flash PROM (boots at
  power-up). In the browser over USB (WebUSB: Chrome or Edge on a computer, Chrome on an Android
  tablet), with no programming tool to install (see the [guide](getting-started.md) for the
  Windows driver and the Linux rule); running Silinx locally also with openFPGALoader,
  xc3sprog, Digilent Adept (`djtgcfg`), ISE iMPACT or **adepttool** (Basys2 on macOS).
- **Logic analyzer** (ChipScope-like, the Silinx toolchain, the Spartan-3E): *Logic Analyzer Settings* picks the
  signals of the design to watch, the clock, the samples and the trigger (with the block RAMs it takes); Implement
  inserts the capture core, read over the board's JTAG cable (BSCAN); *Analyze Design Using the Logic Analyzer* arms it,
  waits for the trigger and shows the samples in the waveform viewer, the cursor on the trigger.

## On an iPad or a tablet

The site (and `Silinx.html`) runs in Safari on an iPad (WebKit) and in a tablet's browser: the HDL
editors and the drawings, simulation, and the Silinx toolchain (synthesis, place and route, the
`.bit`), and in Chrome on an Android tablet board programming too. What is different from a computer:

- **Board programming: Chrome on Android, not an iPad.** Chrome on an Android tablet has WebUSB: it
  programs the board as on a computer (checked on a Samsung tablet), the board on the tablet's USB-C
  port (a USB-C to USB adapter if needed). Safari on an iPad has no WebUSB: generate the `.bit` there, then program the board from a
  computer or an Android tablet.
- **No workspace folder on the disk**: the projects are kept in the browser's storage, which iPadOS
  may clear after some weeks without use. Keep a copy with *File ▸ Export Project (.zip)…*.
- **Less memory per tab**: a large design may fail in synthesis or implementation.
- **The right-click menus open with a long press** (a finger or a pen held still for half a second)
  on a Design-pane row or badge, a document tab, a Files view row, a symbol of the schematic
  editor's list or the SSim wave window; the keyboard's context-menu key (or Shift+F10) opens the
  Design pane's too.
- **Two fingers move a drawing, a pinch zooms it** (the schematic, circuit, ASM chart, state diagram,
  Petri net and symbol editors, the RTL schematic, the FPGA view, the SSim wave window); one finger
  selects and moves its parts.
- **Every drawing zooms and pans as the schematic does** (#4291): the mouse wheel, Ctrl + wheel and a
  trackpad's pinch zoom about the pointer, smoothly (Safari's too, #4296); a trackpad's two-finger scroll pans (Shift + wheel:
  across); the middle button, or Space held down, drags the drawing.
- **Landscape or portrait**: in landscape the layout is the desktop's. In portrait (1024 px wide or
  less) the Design pane is a drawer, opened by the button at the left of the header. The drawing
  editors' properties (and the schematic's symbols) open over the drawing with their toolbar's
  *Properties* (*Symbols*) button, so the drawing keeps the whole width.

## Guided labs

*Project ▸ Guided Labs…* opens a step-by-step tutorial on the project, beside its documents: each step says what to
do, and *Check Step* checks it on the project (a file, a module's ports, Check Syntax with exactly the expected
warnings, the simulation's values at given times, a drawing's check, a port's pin, a process run on the sources as
they are), ticking it in the Steps panel, or giving its hint and the reasons in the console. Silinx ships "First steps"
on the gates example, "A state machine" on traffic, "The clock and the board" on blinky and "The emulator" on stopwatch
(in English and Portuguese); a teacher writes a lab as a `labs/<name>.lab.json` file of a project (*New Source ▸
Guided Lab* starts one from a template; its format: `core/labs.js`), checked as it is edited (each save, and its Check
Syntax, say its problems), and shares it with the project. A link opens a lab beside the project (`lab=<its id>`, e.g.
`…/Silinx/#open=example:stopwatch&lab=stopwatch-emulator`; the MCP's `project_link` adds it to a project's link). The progress is the project's
(`labs/progress.json`): a lab resumes where it was left.

## A design in a link (for lecture slides)

A link opens Silinx on a design, straight in Try it, the simulation or the board emulator, with no project to create
or import: **Share Project…** (the project's right-click menu in the Design pane, the Start page, the ISE
style's File menu) or **Share Module…** (a module's right-click menu) makes it, **A copy** chosen in its window, the view
and the module chosen, the link made by *Generate* and hidden until *Show* (*Copy* copies it all the same, *Show QR
Code* shows its QR code, as large as the window) (its other way, **Live**, shares the project as you work: your name on
the window, *Start Sharing*, then two links in the same window, each made by its own *Generate* and hidden with its
*Copy*, *Show* and *Show QR Code*: the viewers' (`#view=…`), who follow it read only, and what you
do: your documents, views and selection, your simulations and Board Emulators (run again on their page from the same
files, with your time, inputs and view), your runs and the reports you open; and the
editors' (`#edit=…`), who edit it with you; the toolbar's Sharing menu copies either (*Copy View Link*, *Copy Editor
Link*), *Add a User…* gives the link of the role you choose, and it lists who is in, each a viewer or an
editor, and makes a viewer an editor or an editor a viewer, which renews the editors' link: the old one then only
follows, the other editors keep editing; the Collaboration tab's **Sharing** box shows the same, who is in and
those commands, *Share Live…* opens the window with Live chosen, and *Share a Copy…* with A copy chosen). A live share outlives a dropped connection: its owner's page reconnects on
its own (*Reconnecting…* in the toolbar; the relay keeps the room for 2 minutes and the followers keep the project), and
so does a follower of a room the owner's page hosts (#3835). The whole project goes inside the link (`#design=…`, compressed: 5 to 25 KB for the examples; anyone with the
link has every file, its comments too), so nothing has to be hosted. Share Project… can make a **short link** instead
(`#gist=…`, about 140 characters, for a chat that refuses a long message), made by *Generate*, the window saying which
GitHub account is signed in and which repository the project is in (private or public): the project is encrypted in your browser and
saved as a secret gist of your GitHub account (the browser edition's Sign in with GitHub…; a server's `GH_TOKEN`), and
the key is in the link, so GitHub keeps only what it cannot read; opening it needs no sign-in, and your links are your
gists, which you list and delete on GitHub. A short link may expire (*Expires:* a week, a month, six months or a
year; never by default): opened after its date it is refused, and making a short link deletes your expired ones. *File ▸ Short Links…* lists
your short links (when each was made, when it expires), copies again those this browser made, and deletes the ones you
choose (the header's check box selects them all), or the expired ones. Some slide tools cut a link longer than about 2
000 characters: a larger project goes as a zip hosted elsewhere (*Export Project (.zip)…* to Silinx, then
`…/Silinx/#open=https://…/lecture3.zip&view=simulate`), and an example by its name
(`…/Silinx/#open=example:gates&view=try`; `#open=example:traffic&top=traffic&view=try` its state diagram). `view=`
is `try` (the Try it of a schematic, a state diagram, a Petri net, an ASM chart or a circuit), `simulate` (the test bench) or
`emulate` (the board emulator); `top=` names the module (with `simulate`, the test bench). Opening a link makes a project named after the design;
clicked again, that project is opened as it is when it has the same files, and one the student changed is replaced
only when they say so. A zip from another site is fetched only once you agree (its address shown), and only from an
https address that is not of this computer or a local network, the zip's own (a redirection is not followed); a
broken link is said in the console, the workspace as it was.

Share Project… includes Silinx as it is when the link is copied (**Include the current view**): the open tabs, the one in
front, the split and, in the Silinx interface, the task, the side panel, the messages and a maximized document; the
link opens it so, for that page only (the viewer's own layout is not changed).

## Editing in VS Code

On your computer, with Silinx's server (`silinx serve`, the launchers), a project's text files open in VS Code:
**Open in VS Code** in a source's right-click menu in the Design pane (an HDL module, a C / C++ source of Silinx HLS) and
the Files page (constraints, any text file), and in its tab's menu, at the cursor's line; **Open Folder in VS Code** in
the project's menu opens its folder. What is saved there shows in Silinx at once; a file with changes not saved in
Silinx asks which version to keep. A drawing's HDL is not offered (the drawing makes it). Silinx runs the editor's
command (`code`, found on PATH or where VS Code is installed), or opens its `vscode://` link when there is none. Another
editor of the family is chosen in `~/.silinx/config.json`: `"editor": "code-insiders"` (VS Code Insiders), `"codium"`
(VSCodium), `"cursor"` (Cursor), a program's absolute path (with VS Code's command line), or `"off"` (also
`SILINX_EDITOR=off`). It is not in the browser edition, nor for a page on another computer than the server's: the
editor would open on the server's screen.

## Merging a group's work (Merge Contribution…)

When several people work on copies of one project (each at home, on a copy a teacher handed out), *Project ▸ Merge
Contribution…* brings a copy back into the project: its folder, or the .zip *File ▸ Export Project (.zip)…* made of it.
A copy given out remembers where it came from (the project and its version then), so the merge is three-way:
- what only one side changed, added or removed is taken;
- a drawing both changed is merged by its objects (a state each side added: both kept), and its HDL made again;
- a text file both changed (HDL, a test bench, constraints) is merged by its lines: changes apart at once, the same
  lines in the **merge view** (Merge Lines…: the common ancestor, mine and theirs side by side, the result below, each
  conflict Mine, Theirs, Both or written by hand), never with conflict markers; a file renamed in the copy and changed
  here (or the other way round) is merged as a rename;
- for a file, a drawing's object or a setting both changed, you choose Mine or Theirs, with Compare beside it.

A copy made before Silinx recorded this is merged two-way: each file that differs is a choice. *Undo Merge* puts the
project back as it was. A merge that takes someone else's files makes the project untrusted until you trust it, as an
import does. For a group working at the same time, Share Project's live editing needs no merge.

## A project on GitHub (git, a GitHub Classroom assignment)

On your computer or a Silinx server, a project can live in a GitHub repository, through the system's git. **The
Collaboration tab** (the side panel's last, after Teaching, in both interfaces) gathers its commands in its Git
Repository box: the project's GitHub repository and branch (the commits to push or to pull, the files in conflict), Commit…, Push, Pull, Changes…
(how many files changed), History…, the sign-in and the last push's checks; for
a project with no repository, Store Project in a GitHub Repository… and Open from GitHub Repository…; and its Sharing box: Share a Copy…
(Share Project…'s copy), and live sharing (Share Live…, who is in, the links, Stop Sharing, Follow, Stop Following). The menus keep the same commands:
- **Open from GitHub Repository…** (the Collaboration tab, the Start page, the ISE style's File menu) opens a project from a
  GitHub repository, a GitHub Classroom assignment's too.
- **Commit…, Push to GitHub and Pull from GitHub** (the Collaboration tab; the project's right-click menu in the Design
  pane, under Git; the File menu) send it back and bring the others' changes in. A text file changed on both sides is
  merged by its lines; when the same lines changed, the pull opens the **merge view** (Mine, Theirs, Both or the lines
  written, per conflict) and pulls again with your choices, never writing conflict markers. A pull that still conflicts
  (a file removed on one side and changed on the other) pulls nothing and leaves the files as they were. The repository's hidden files (`.vscode`, `.github`) and the tools' outputs stay in the repository, out of
  the project's folder, and a pull's files pass the import gate, as an imported project's.
- **New Branch…, Switch Branch… and Merge Branch…** (the Collaboration tab, which shows the branch; the same menus):
  each person of a group works on a branch of their own, and Merge Branch… merges another person's branch into theirs
  as Pull does (a drawing by its objects, a file by its lines, the same objects or lines chosen in the merge view),
  with a merge commit. Switch and Merge need the changes committed first.
- **The Design pane** marks what changed (M) or is new (N) since the last commit; **Changes…** (the Collaboration tab,
  before History…; the Git menus) lists every changed file in a window, deleted ones (D) too, the files in conflict (C)
  first, and a click compares a file with the last commit; the window follows the changes while it is open.
- **History…** lists the commits, and opens a file as it was in one, read only.
- **Compare** (in Changes…, History… and Commit…) shows a drawing's two versions side by side, what was added, removed, moved
  or changed marked on them, and an HDL file's lines side by side.
- **A drawing changed on both sides** (a circuit too) is merged by its objects on Pull, never as text, and its HDL
  made again; two objects both sides added are both kept, even under one id; for an object both sides changed, Pull
  asks whose version it keeps (Mine or Theirs), and checks the result as Check Drawing does.
- **Store Project in a GitHub Repository…** makes a repository of a project, with a `.gitignore` that leaves `build/` and the tools'
  outputs out.

git signs in to GitHub with its own credentials (GitHub's command line `gh auth login`, Git Credential Manager or an
SSH key): Silinx never asks for, stores or logs a password or a token. A server's operator can turn git off with
`SILINX_GIT=off`.

In the browser edition the same commands go through GitHub's API (there is no git in a browser):
- **Open from GitHub Repository…** opens a public repository with no sign-in.
- **Sign in with GitHub…** (the first line of the Collaboration tab's Git Repository box, Sign out of GitHub once signed in; the Git commands): a private repository, a commit and a pull need it. Where the
  site has Silinx's sign-in relay, it gives a code to enter at github.com/login/device; elsewhere, it asks for a
  fine-grained personal access token of yours (github.com/settings/personal-access-tokens/new: the repositories to
  open, Contents read and write; Actions and Commit statuses read-only for GitHub Checks, which then reads the
  workflows' jobs: GitHub's Checks themselves, with a Classroom test's verdict, need a classic token or the sign-in's code). The sign-in is kept in this browser only, and **Sign out of GitHub** forgets it.
- **Commit and Push…** commits and pushes in one step. A commit GitHub rejects (someone pushed meanwhile) says to
  pull first.
- **Store Project in a GitHub Repository…** takes an empty GitHub repository (make it at github.com/new); the first commit is the
  project's.

A computer or a server with no git can use GitHub's API the same way, for the interface and the MCP's git tools:
start Silinx with `SILINX_GIT=github` and a token in `GH_TOKEN` (`GH_TOKEN=$(gh auth token)`), which Silinx never
stores.

## Privacy and usage counts

The site (https://pmnmalo.github.io/Silinx/ and its dev/ edition) counts its visits and what is
used in it (a new project, a simulation, Implement Design, a bitstream, a board programmed) with
[GoatCounter](https://www.goatcounter.com): no cookies, no personal data, never the content of a
project. The application and the downloaded `Silinx.html` send nothing. The counter is added by the
site's build (`scripts/site-analytics.mjs`, when the repository variable `GOATCOUNTER_CODE` is set).

Using Silinx in a course, a school or on your own? Tell us on
[GitHub Discussions](https://github.com/pmnmalo/Silinx/discussions/151) (Help ▸ Tell Us Who You Are…).

