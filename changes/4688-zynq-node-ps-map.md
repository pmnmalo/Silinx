In short:

- A Zynq node of a System can have a PS–PL register map in its Properties. Its PL is then built with the PS7 and its
  M_AXI_GP0 on the map's registers.

In detail:

- **A Zynq node's PS–PL register map (#4688, part 2b):** a System's FPGA node on a Zynq board has a `psMap`, an
  AXI4-Lite `.regs.json` of its folder (`core/zynq-ps-map.js`).
  - The node's Properties choose it from its folder's maps. The MCP's `edit_system` `change_node` sets it, and
    `check_system` describes it.
  - The System's Check refuses it on a board with no PS, out of the node's folder, missing from the project, or on
    another bus.
  - The node's Implement writes Silinx's top, `<module>_zynq` (the PS7, its M_AXI_GP0 on the map's slave, the module),
    into its build folder and builds it in place of the module. A module whose ports do not meet the registers refuses
    it.
  - Tests: `test/mcp-zynq-ps-map.test.js` (the map's checks and refusals; the node synthesized in VHDL and Verilog with
    no error and no warning; a port missing refused), `test/ui/zynq-ps.test.js` (its Properties, both interfaces,
    Portuguese), `test/system-edit.test.js`.
