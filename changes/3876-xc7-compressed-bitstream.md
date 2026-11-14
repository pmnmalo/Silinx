In short:

- **A smaller .bit on the Basys 3 and the Nexys A7 (experimental):** the Silinx toolchain's programming file is
  compressed as the boards' constraints ask (`BITSTREAM.GENERAL.COMPRESS`), as Vivado's is: about 300 KB instead of
  2.19 MB on the Basys 3, faster to load and smaller in the board's flash.

In detail:

- **The 7-series' .bit compressed (#3876):** Generate Programming File with the Silinx toolchain writes the compressed
  bitstream, in the packets of Vivado's (multiple frame writes for the repeated frames), when the XDC sets
  `BITSTREAM.GENERAL.COMPRESS TRUE`, which the Basys 3's and the Nexys A7's constraints do; its log line says
  "compressed". The toolchain reads it back to the same frames (silinx-fpga's fragment).
