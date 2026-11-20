# Silinx for an AI assistant (MCP)

[User's guide](README.md) · English · [Português](../pt/ai-mcp.md)

An AI assistant (Claude, or any client of the Model Context Protocol) can work on your Silinx projects: create one
from an example, write a module, draw a state machine, run the simulation and the implementation, read the reports.
Everything the interface does is a tool of Silinx's MCP server, done through the same functions, with the same
checks and messages.

## Connecting it

With Silinx installed on your computer ([Getting started](getting-started.md), way 2), the assistant starts
`silinx mcp`. In Claude Code: `claude mcp add silinx -- node /path/to/silinx/bin/silinx.js mcp`; in Claude Desktop,
its `claude_desktop_config.json`:

```json
{ "mcpServers": { "silinx": { "command": "node", "args": ["/path/to/silinx/bin/silinx.js", "mcp"] } } }
```

Then ask, for example: *"Make a project from the traffic example for a Nexys2, simulate it and tell me the
warnings."* Files go in and out of the projects only through an exchange folder: your Downloads, or the folder
`SILINX_MCP_FOLDER` names.

## Its tools

`node bin/silinx.js mcp` serves the projects of the Silinx workspace to an AI assistant (Claude
Desktop, Claude Code, any client of the Model Context Protocol) over stdin / stdout. Its tools:
`list_examples` (the examples, then the test designs: the designs Silinx is tested with), `new_project_from_example`, `new_project` (an empty one, for a board; `kind: design`, a design and simulation project; `top_source_type`, its top document as New Project's Top-Level Source Type), `set_top` (the top
module and the test bench, as *Set as Top Module*; the constraints from the board's pins, as *Update
Constraints*; `unset_top`, as *Unset as Top Module*), `list_projects`, `project_info`, `read_file`, `write_file` (a drawing's HDL file made again from it, as its editor does),
`list_devices` (the boards and devices), `set_design_properties` (the board, the device, the synthesis tool, the Preferred Language, the Project Kind, the
Top-Level Source Type, as *Design Properties*), `set_source_properties` (a drawing's language), `new_source` (every type of *New Source*: a module with its ports, a test
bench, a package, constraints, a .mem, a C / C++ function, an empty drawing), `clock_manager` and `block_memory` (the Clocking Wizard's DCM / PLL, the
Block Memory wizard's RAM or ROM; a module of theirs made again with other settings), `test_bench_wizard` (a self-checking
test bench: its vectors, their expected outputs given or from the design) and `constraints_wizard` (a UCF on the board's pins; a PCF, LPF, CST or XDC on the other families' boards), `check_constraints` (*Check Constraints*, in the device's format), `convert_module` (an HDL module to a schematic, ASM chart or state
diagram, its base from then on) and `convert_drawing` (a state diagram to an ASM chart and back, or to its Boolean algebra), `related_view` (a read-only view shown beside a source, nothing written: an HDL source's translation, a state diagram's ASM chart, an ASM chart's or a Petri net's state diagram, a truth table's schematic, or its results: the canonical and minimal forms, each output's HDL logic), `set_output_logic` (a truth table output's HDL logic or the minimal solution it uses, its HDL made again), `set_notation` (the notation of the Boolean expressions shown, as *Settings ▸ Boolean Notation*: Electronics / Engineering, a̅.b + c, by default; text, /a.b + c; logic, ¬a ∧ b ∨ c; VHDL; Verilog), `set_schematic_symbols` (the standard the schematics' gates are drawn in, as *Settings ▸ Schematic Symbols*: IEEE Std 91-1984's distinctive shapes by default, or IEC 60617-12's rectangles; the look only), `check_drawing` (an ASM chart's, a state diagram's, a Petri net's or a circuit's Check), `set_fsm_outputs` (a state's or a transition's outputs in a state diagram, as its Properties set them: a value per output, checked against its width, empty for the default), `set_fsm_condition` (a transition's condition in a state diagram, or its Else box: the state's otherwise), `set_fsm_look` (a state's or a transition's look in a state diagram, as its Properties' Look sets it: colours, line width and style, text size, style and font; the HDL unchanged), `circuit_parts`, `import_part` and `edit_circuit` (a digital circuit's parts, with their pinouts, a project's KiCad parts imported into its `parts/` folder, and its edits: parts added on a breadboard's holes, moved, turned, copied, deleted, wired, set (a part's properties, a wire's colour), its wires' style,
docs/CIRCUITS.md), `rearrange_wires` and `rearrange_schematic` (a schematic's Rearrange Wires: few bends and crossings, the wires of a channel spread evenly; and Rearrange Schematic), `move_junction` (a schematic's junction dot moved, the wires ending on it following, as its editor's drag does), `set_wire_style` (how a schematic's wires are drawn: direct, orthogonal or curved, the look only), `add_markers` (I/O markers on every open pin of an instance or of a region, named in1, out1… as the Add I/O Marker tool's rectangle does), `place_instance` (a module's instance placed in a schematic, as its Symbols palette does; an arrayed one) and `set_instance_width` (an instance's Width and Shared pins), `read_symbol`, `edit_symbol` and `update_symbols` (a module's symbol, as the Symbol Editor shows and edits it; a schematic's out-of-date instances drawn with it, as *Update Symbol*), `symbol_info` (a symbol's datasheet, as *Symbol Info*, with its composition's levels) and `symbol_composition` (a level of a palette symbol's composition drawn as a schematic: ADD8 of two ADD4, ADD4 of four FA1, FA1 of gates), `save_wave_config` and `load_wave_config` (a simulation's wave configuration saved as a .wcfg of the project, and loaded), `simulate_drawing` (an ASM chart or a state diagram stepped clock edge by clock edge, as its Simulate panel does), `verify` (a module's equivalence with a reference module, as *Verify Equivalence*, or with no reference its own assertions, as *Verify Assertions*, or with a property a state diagram's or an ASM chart's, as *Verify Property*: a state never reached, a state reached, outputs never 1 together; proved, or the first clock cycle where an output differs, an assertion fails or the property does, its counterexample written as a test bench and replayed), `set_process_properties` (the Optimization, the start-up clock, the Spartan-6's Map, the 7-series' Place & Route seeds),
`remove_from_project` and `add_to_project`, `rename_file` (a file or a folder), `rename_module` (its
instances, drawings and top with it), `delete_file` and `delete_project` (into the workspace's `.trash` folder, from where they
can be moved back), `rename_project` (a project's name: its folder renamed, as Rename Project…),
`git_clone`, `git_init`, `git_status`, `git_commit`, `git_push`, `git_pull`, `git_log`, `git_diff`, `git_checks`, `git_branch`, `git_switch` and `git_merge` (a project in a GitHub repository, as the interface's git: its history, a branch per person and another branch merged in, a file as it was in a commit, what changed in a file, a drawing's by its objects, a pull's conflicts chosen per object or per hunk of lines, what GitHub's workflows said of the last push: a Classroom assignment's verdicts),
`export_project` and `import_project` (a Xilinx ISE or a Silinx project, as a .zip; a .xise or a project folder too;
only in the exchange folder: your Downloads, or the folder `SILINX_MCP_FOLDER` names), `merge_preview`, `merge_contribution` and
`undo_merge` (another person's copy of a project merged into it, as *Merge Contribution…*: three-way through the copy's
ancestor, a drawing by its objects, a text file by its lines, its conflicts chosen per hunk; and undone), `import_source` (files of the exchange
folder copied into a project, as *Import Source* / *Add Copy of Source* / *Import Test Bench*), `find_in_project` (*Find in
Project*: every source's lines and every drawing's texts; its Replace All), `open_in_editor` (*Open in VS Code*: a file at a
line, or the project's folder, in the user's editor on this computer), `project_link` and `open_link` (a project's
link, the project inside it, opening Try it, the simulation or the board emulator, for slides; a project made from such a link
or from an example's, one that differs never replaced), `short_links` and `delete_short_link` (*File ▸ Short Links…*: the
server's GitHub account's short links listed, and deleted: some, the expired ones or all), `grade` (*silinx grade* and the
Exercise document: an exercise's tests run on the project or on submissions, its problems, its ports and reference),
`check_syntax` (the errors and warnings of *Check Syntax*, the design checks included; their lint warnings left out as with
*Edit ▸ Design Checks* off),
`simulate` (the test bench: its messages and its signals' changes; against the post-synthesis, post-translate, post-map or
post-place & route model too, with its timing; signals forced, a value or a clock, as SSim's Force; its waves as a VCD file), `c_simulation`, `c_cosimulation`,
`c_synthesis_report` and `c_generated` (a C / C++ source of Silinx HLS: its main() run, its C/RTL co-simulation, its report, the HDL
and the ASM chart made from it), `run_process` (synthesize,
implement, bitstream, timing, power, pins, the simulation models: the Silinx toolchain, or ISE when it is configured; a project the
MCP server made or imported runs ISE, or programs a board or a PROM, only once you trust it in the interface: *Trust Project*, #2981) and
`get_report` (the Design Summary and the reports of the last run: with the Silinx toolchain, Yosys's
statistics for the synthesis and the pack and route summaries for map and par), `program_board` (the board programmed with the
project's file, as *Configure Target Device*: a .bit into the FPGA, an ECP5's .bit or a Gowin's .fs into its SRAM, an iCE40's .bin
into its SPI flash; a GateMate's board refused, openFPGALoader's; a trusted project only, the client asking first), `lab` (a project's guided labs: listed, a step shown,
checked on the project and recorded, as *Guided Labs…* does; a lab restarted), `capture_settings` (the logic analyzer's
capture: the signals of the design to watch on the board, the clock, the depth, the trigger, checked on the design with the block
RAMs it takes), `capture` (a capture on the board over the JTAG cable, the Basys2's / Nexys2's Digilent Adept USB through
adepttool: armed, its trigger waited for, the samples read and saved in `build/capture.json`) and `timing_paths` (the Silinx toolchain's,
Xilinx ISE's or AMD Vivado's slowest paths, as the Static Timing Report's Paths panel: a path's stages, their delays against the PERIOD, and the
source lines, sites and nets its Show Path highlights, and the elements of the drawings those lines are generated from; with `from` and `to`, the worst paths between two registers). The projects are those of the Project Navigator
(the workspace, `SILINX_WORKSPACE`; the browser edition's workspace folder too, its format being
the same), so what the assistant does is seen in the interface when the project is opened again.
Every path stays inside its project; the ISE machine's
address never appears in a result. Where the assistant's results can be sent is yours to say (#3363): `git_init` gives a project
only a GitHub repository that `~/.silinx/config.json` names (`"mcp": { "remotes": ["owner/repo", "owner/*"] }`), and
`share_project` / `follow_project` go only through this computer's Silinx, a relay it names (`"relay": { "relays": [...] }`),
or the Cloudflare relay that `live_relay` set (a Cloudflare Worker's address only, checked first; deploying it is yours).
A result that holds a project's or a remote's own text (a file, a commit's message, a report, a shared project's files) is
marked as such (it ends with "[End of untrusted content <nonce> …]", the nonce made for that call, and `untrusted` in its
structured content; every tool that takes a project, by default): data, never instructions. In Claude Desktop's `claude_desktop_config.json`:

```json
{ "mcpServers": { "silinx": { "command": "node", "args": ["/path/to/silinx/bin/silinx.js", "mcp"] } } }
```

and in Claude Code: `claude mcp add silinx -- node /path/to/silinx/bin/silinx.js mcp`. To keep the
assistant's projects apart, give it a workspace of its own: `"env": { "SILINX_WORKSPACE": "/path/to/folder" }`
in Claude Desktop's entry, or `claude mcp add silinx -e SILINX_WORKSPACE=/path/to/folder -- node …` (the
server's name before `-e`, which takes several values).

With the same workspace, the interface of `silinx serve` follows what the assistant does in the project it has
open: a source written or made, a run (the Design pane, an open editor, the processes' marks and the Design Summary
update at once); a file changed in its editor and by the assistant asks which version to keep.

