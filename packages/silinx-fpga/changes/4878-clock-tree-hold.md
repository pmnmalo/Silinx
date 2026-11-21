In detail:

- **The 7-series' clock tree balanced (#4878):** `@silinx/nextpnr-himbaechel-xc7` 0.5.0 (pmnmalo/nextpnr-spartan#57):
  the global clock's spine (the BUFG tiles', the rebuffers', the CLK_HROW's, the HCLK's leaves) of the least delay in its
  chip databases, so a register one clock region further is no longer 1.05 ns late (the Zybo Z7-20's stopwatch's hold
  violation gone).
