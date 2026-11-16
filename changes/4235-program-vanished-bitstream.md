In detail:

- **A bitstream removed while the programming starts (#4235):** programming the board (and verifying or programming
  the PROM) checked that the bitstream existed, then read it: a file removed in between (a rebuild, a clean) gave the
  system's raw "ENOENT: no such file or directory" instead of "bitstream not found". The read's ENOENT is now that same
  message, for a .bit, an iCE40's .bin, a Gowin's .fs, an ECP5's .bit and the PROM's image. The test made the file
  vanish at a random moment (it failed the CI of the release silinx-fpga-v0.4.3 on macOS): it now removes it exactly
  between the check and the read. Tests: programmer (program: request errors; prom: failures and request errors).
