In short:

- **A System as the top:** the Top-Level Source Type **System (co-design)** (New Project, Design Properties), or
  **Set as Top Module** on a System, makes an FPGA project a co-design project with that System as its top.
  **Set as Top Module** on one of its modules makes it an FPGA project again.

In detail:

- **A System as a project's top (#5402):** `core/system-top.js`.
  - **To a co-design project:** `toSystemTop` makes the project a co-design project (`asCodesignProject`) with the System
    given, or a new `<name>.sys.json`, as its top. Its board, device and constraints are kept in `fpga`.
  - **Back to an FPGA project:** `toModuleTop` makes a co-design project an FPGA project again, the module its top, on the
    board (and variant's device) of the System's FPGA node that runs it, else on the board it had.
  - **Where:** in the interface (`web/js/system-top-ui.js`), from Design Properties' Top-Level Source Type, Set as Top
    Module on a System in the Files view, and Set as Top Module on a module of a co-design project. In the MCP server
    (`server/mcp-system-top.js`), from `set_top` (a `.sys.json`, or a co-design project's module),
    `set_design_properties` `top_source_type: system`, and `new_project` `top_source_type: system` (a co-design project).
  - **Top-Level Source Type:** `core/top-types.js` gains `system`, offered where co-design is on (`offeredTopTypes`). It is
    refused in a release and in a design and simulation project. A co-design project's top type is System.
  - **Tests:** system-top, mcp-system-top, and the UI's system-top (both interfaces, Portuguese, no warnings).
