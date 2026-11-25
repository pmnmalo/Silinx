In short:

- **An FPGA node emulated on its models:** in a System's Emulate, an FPGA node's Emulate Node has its Behavioral
  (RTL), Post-Synthesis, Post-Translate, Post-Map and Post-Place & Route models under it, as an FPGA project's Emulate on
  Board has. A model is made first by the node's flow when it is not there. Emulation Properties… chooses each FPGA
  node's model for Emulate System.

In detail:

- **An FPGA node's models in the System Emulator (#5612, `core/system-models.js`):**
  - The models are those its board's toolchain makes.
  - Each is read from its node's build (`build/nodes/<id>/build/reports.json`, the board's own model first). One not
    made yet is made first by the node's own flow (`web/js/system-emu-open.js`, as Generate and Emulate does), and the
    run says so.
  - The model's netlist is compiled with the device's primitives in place of the node's RTL, the same in the page's
    worker and in the MCP server (`core/system-run.js` gives `netlist` the node's id).
  - The emulator's tab and status line name the model.
- **The Emulate tree and the ISE style's node row** list the models under Emulate Node (`nodeModelProcs`).
- **The Emulation Properties:** each FPGA node's model, in `silinx.json`'s `system.emulate.models` (its RTL: left out).
  Ticking the nodes keeps the models.
- **MCP (#2674):**
  - `set_process_properties`' `emulate_nodes` takes a node's model (`fpga@postsynth`; the node named alone: its RTL).
  - `simulate` with `controls` runs the Emulation Properties' models. One not made yet is refused, naming how to make it.
  - `run_process`' simulation models take a System's `node` too.
