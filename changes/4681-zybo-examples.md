In short:

- Every example built for the Zybo Z7-20 and Z7-10 by the Silinx toolchain (their programmable logic), and tested.

In detail:

- **The examples on the Zybo Z7 through the Silinx toolchain (#4681, #4679):** every example, gates … micro80, built for the
  Zybo Z7-20 (XC7Z020) and the Z7-10 (XC7Z010) and checked as on the Artix-7's boards: its `.bit` the part's (its ID code),
  its frames Project X-Ray's `fasm2frames`', the round trip clean, its pins the XDC's, its LUTs, registers and frequency held
  to a table (`ZYNQ_TARGETS`, `test/open-flow-zynq-server.test.js`), and its post-place & route model simulated against
  its test bench (`test/zynq-routed.test.js`). Eight meet the board's 125 MHz with no warning; pong, stopwatch and micro80
  reach 97–113 MHz on nextpnr's estimate (Vivado meets 125 MHz on them) and warn of it (#4877), and the Z7-20's stopwatch
  warns of a hold violation on its laps RAM (#4878). The 7-series' examples' tests shared by the two boards' files
  (`test/xc7-examples-lib.mjs`).
