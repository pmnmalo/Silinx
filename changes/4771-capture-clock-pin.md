In detail:

- **The pins a design's constraints take, read by the constraints' own readers (#4771):** the logic analyzer's check
  that the board's clock pin is not a port of the design already (core/flow-ide.js captureUcf), the pins ISE's flow
  assigns to ports with no LOC (server/ise.js, its awk) and the netlist fixtures' (scripts/gen-netlist-fixtures.mjs)
  read the UCF or XDC with regular expressions of their own, which missed `NET "clk" IOSTANDARD = … | LOC = …`, a LOC in
  lower case and XDC's `set_property -dict { PACKAGE_PIN … }` and `get_ports { clk }`, and took a commented-out LOC; they
  now read it with the format's reader (`readConstraints`), through `pinsTaken` (core/auto-pins.js). ISE's awk reads the
  pins taken from `usedpins.txt`, written beside `autopins.txt`.
