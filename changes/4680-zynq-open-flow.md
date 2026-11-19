In short:

- The Zynq-7000's XC7Z010 and XC7Z020 (the Zybo Z7-10 and Z7-20) implemented by the Silinx toolchain too, their
  programmable logic only, beside AMD Vivado, and in the browser edition.

In detail:

- **The Zynq-7000's programmable logic in the Silinx toolchain (#4680, #4679):** the XC7Z010 and the XC7Z020 (CLG400) are
  implemented by the 7-series' back end (Yosys, nextpnr-himbaechel's xilinx, Silinx's bitstream) as the Artix-7 is:
  Project X-Ray's bit databases of the `xc7z010clg400-1` and the `xc7z020clg400-1` (its `zynq7`), nextpnr's chip
  databases of the xc7z010 and the xc7z020 (`@silinx/nextpnr-himbaechel-xc7` 0.4.0, pmnmalo/nextpnr-spartan#55). AMD
  Vivado stays the default of the local server, the Silinx toolchain on trial (the project's synthesis tool Silinx);
  the browser edition's flow is the Silinx toolchain's. The other Zynq-7000 parts (the XC7Z007S, XC7Z012S, XC7Z014S,
  XC7Z015, XC7Z030) stay Vivado's alone. The logic analyzer's BSCAN on the Zynq's own tile. Its processing system is
  not set up yet (#4686).
