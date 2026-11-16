In short:

- **Optimization Speed on a very large design:** over 2000 slices, Place & Route makes two placements, not four: each
  takes 20 to 35 minutes on such a design (ITC'99's b17, 3787 slices), and four took 1.5 to 2.5 hours.

In detail:

- **Two placements over 2000 slices at Speed (#3821):** the toolchain's `NEXTPNR_TRIES` (silinx-fpga's changelog), so
  that the Quality comparison measures itc99-b17 at Speed within its 2-hour limit per build, which stopped it every run;
  the README and the Quality page say the counts (32 up to 100 slices, 8 up to 500, 4 up to 2000, 2 above).
