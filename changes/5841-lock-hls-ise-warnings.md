In short:

- **C to HDL:** a pipelined function with `#pragma HLS INTERFACE ap_ctrl_none port=return` runs by itself, a call every
  clock cycle, with no start nor done to connect, as Vitis HLS's free-running form; a `static const` table is
  constants, not registers.

In detail:

- **The lock example builds in ISE with no warnings again (#5841):** Silinx HLS made a register that no state writes
  (a `static const` table, penalty's `SECONDS`) flip-flops that only the reset loads, which XST trims with a warning each
  (Xst:1710, 1895, 2404): their reads are now constants of their reset values; a shift left by a constant read its
  operand whole, the operand widened only to have its top bits shifted out (typed's `ap_t11<15:12>`, Xst:646): it reads
  only the bits it keeps; a pipelined function with `ap_ctrl_none` and no stream runs by itself (no block protocol, no
  state register, its arguments read every cycle), co-simulated a C call per clock cycle at II=1 and a depth of 1. lock's
  penalty is logic alone (its table at the file's level, `ap_ctrl_none`), typed runs by itself with a `call` argument,
  and top.vhd connects every port of theirs (no Xst:753). test/examples-xst-registers.test.js mirrors the three
  warnings on every example's C and C++ module.
