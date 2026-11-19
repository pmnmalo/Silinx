In short:

- **Trust Project, where it is refused:** programming an imported project (the board, the PROM), or running Xilinx
  ISE or AMD Vivado for it, says why in the console with the Trust Project button on that line; Trust Project asks
  before trusting the project.

In detail:

- **A refusal for an untrusted project carries its Trust Project button (#4583):** every console line refusing a
  process for an untrusted project has the button (one per refusal: the error and its "… failed:" line share it);
  the local server's refusal of Program FPGA, of the PROM's operations and of an open family's Program is said in the
  console, no longer in a dialog; Trust Project asks first, and once the project is trusted every Trust Project button
  of it is disabled.
