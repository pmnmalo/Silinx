In short:

- **Help ▸ Keyboard Shortcuts** lists the schematic's F1 (Symbol Info), the circuit editor's R, Del and Esc, and the
  drawings' Esc that ends an add tool.

In detail:

- **The MCP server's instructions and descriptions brought up to date (part of #4123):** the instructions name the
  boards beyond the Basys2 and Nexys2 (list_devices), the design and simulation projects, the circuits and the drawings'
  tools (check_drawing, simulate_drawing, related_view, set_notation, convert_module, symbol_info, place_instance,
  circuit_parts, edit_circuit…), short_links and grade, and a live share with editors; share_project is no longer called
  read only (with editors its start result no longer says it either, and its description says that the interface's
  Live share always makes the editors' link, share_project only with editors: true); new_project and
  new_project_from_example take any board of list_devices; set_design_properties says its Project Kind and Top-Level
  Source Type; run_process says which 7-series devices Vivado alone implements and the Artix-7's Silinx toolchain on
  trial; new_source names the LPF, CST and XDC constraints and the circuit; circuit_parts its kinds pull and probe, its
  pins' weak, probe, oc and nc and the full breadboard's holes; simulate_drawing's title the circuits; related_view's
  notation its fsm view and engineering's AND as a point, its results their gates by type; check_syntax a drawing that
  makes no module and Check Design; the conversions the notation of their conditions. `silinx help` gives `silinx ucf`
  any board and `silinx mcp` its folders (SILINX_WORKSPACE, SILINX_MCP_FOLDER).
