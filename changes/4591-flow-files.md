In short:

- **The constraints where the flow is:** the ISE style's Implementation view lists the constraints file (UCF, PCF,
  LPF, CST, CCF or XDC) and the memory images under the top module, as ISE does; the Silinx interface's Implement and
  Emulate panels show the top module with the same files above their processes. A double-click opens a file.

In detail:

- **Implementation and Emulation: the files their flow reads (#4591):** `core/flow-files.js` lists them (the
  project's constraints, then the `.mem`, `.hex` and `.coe` memory images; none in a design and simulation project);
  the Implementation view's top module has them after its instances (the constraints' row selected shows Edit
  Constraints (Text), Check Constraints and I/O Pin Planning; the menu is the file's), the Simulation view none;
  Implement's and Emulate's side panels have the top module's row with its badges and the files under it
  (`web/js/flow-files-tree.js`); the Silinx interface's Design page stays without them (#1250). The MCP's
  `project_info` reports them (`flowFiles`).
- **tasks.test.js's tab row (#4591):** its two assertions of the side panel's tabs follow #4577's order (Collaboration
  before Teaching), in English and in Portuguese.
