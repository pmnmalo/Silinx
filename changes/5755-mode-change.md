In short:

- Project ▸ Change Mode… moves a project between Circuit, Board and System. Going up loses nothing: a Circuit project
  given a board becomes a Board project; a Board project becomes a System whose first node is its board, its files moved
  into the node's folder. Going down is allowed with a warning that lists what is lost (the other nodes, the links, the
  board, the constraints file); nothing is deleted from the disk.

In detail:

- **Mode changes, phase 2 (#5755, roadmap #5753):** `core/mode-change.js`, the plan of a change, one for the interface
  and the MCP: Circuit → Board (a board or a device, its constraints file written from the board's pins); Board or Circuit
  → System (its implicit node the System's first, the root entries that hold its files moved into the node's folder, its
  drawings' HDL paths followed, `<project>.sys.json` written, another name if one is there); System → Board (an FPGA node
  kept, the first or the one chosen: its board, device, top module and constraints; the other nodes' sources out of the
  project's list); Board → Circuit (the board, the constraints file and the HDL and C sources no drawing makes out of the
  project). Board → System → Board gives back the same board, top module and constraints.
- **Project ▸ Change Mode…** (`web/js/mode-change-ui.js`): the three mode cards, what the change does said as it is
  chosen (a loss in the warning's colour), the board or the node kept to choose; each loss a WARNING in the console. A
  version of the project is kept before it (#5740). Portuguese: Mudar o Modo.
- **MCP:** `set_design_properties` takes `mode` (with board, variant, keep, confirm; a field, not a tool of its own: the tools' list's budget, #5520): going down is refused without `confirm`, the refusal saying
  what would be lost; with it, each loss a WARNING line. A version is kept before it.
