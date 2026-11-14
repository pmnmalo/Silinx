In short:

- **AMD Vivado on the Spartan-7, the Kintex-7 and the Zynq-7000.** The other 7-series families of Vivado ML Standard
  (the free edition) are AMD Vivado's, as the Artix-7 is: the New Project wizard and Design Properties list the
  Spartan-7 (XC7S6 to XC7S100) and the Zynq-7000's single-core parts and XC7Z015 besides its others, with Synthesis
  Tool: Vivado, the whole flow to the bitstream on the local server. A Zynq's programmable logic only: no processing
  system is set up.

In detail:

- **Vivado ML Standard's 7-series (Part of #3895).** The Spartan-7 a family of its own (FAMILY_INFO, the device
  database: its parts and packages from DS180, the Artix-7's HR SelectIO), and the Zynq-7000's XC7Z007S, XC7Z012S,
  XC7Z014S and XC7Z015 (DS190); the Spartan-7, the Kintex-7 (XC7K70T, XC7K160T) and the Zynq-7000 AMD Vivado's flow
  (server/vivado.js), experimental as the Artix-7, with no back end of the Silinx toolchain (no bit database of their
  parts): Synthesis Tool Vivado alone and locked in the dialogs, the project's synthesis tool ignored by Implement, the
  Silinx toolchain or ISE asked for refused with a message naming Vivado (POST implement, run_process,
  set_design_properties), none in the browser edition (its warning and its error). The Virtex-7, no free edition's,
  keeps ISE 14.7's flow. run.tcl of a Zynq-7000 sets none of an FPGA's configuration properties (CFGBVS,
  CONFIG_VOLTAGE, the flash's). list_devices marks the 7-series "experimental: AMD Vivado's flow".
