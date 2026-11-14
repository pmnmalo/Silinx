In detail:

- **The interface names' rule kept (#3942):** a design and simulation project's refused Xilinx ISE export says "not as
  an ISE project" (core/project-kind.js), and its test the same: its "a Xilinx ISE one" read as the ISE style
  interface's old name to test/interface-ids.test.js, which failed on main since #3917.
