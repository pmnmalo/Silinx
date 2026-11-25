In short:

- The MCCP and SCCP modules: timers, output compare, PWM on the pins and input capture.

In detail:

- **MCCP1-3 and SCCP4-7 (part 1 of #5529):** ccp.js, each module's time base (timebase.js: counted lazily, its
  periods' starts clock events) on the system clock, the SOSC or twice the peripheral clock, through TMRPS (1, 4, 16,
  64); the timer modes (two 16-bit timers, CCTxIF and CCPxIF, a period register 0 holding its timer; one 32-bit
  timer); single edge compare (high, low, toggle one clock after CCPxRA's match, SCEVT, CCPxIF); dual edge compare and
  the buffered PWM (high one clock after CCPxRA's match, low after CCPxRB's, CCPxIF at the fall, the buffered values at
  the next period), steered to the OCMxA-F enabled in CCPxCON2H with POLACE / POLBDF's polarity; OPS's postscale; a
  module synchronised to another's period (SYNC 00010-01000); input capture (the free-running timer's value at the
  ICMx pin's edges: every edge, rising, falling, both, every 4th and 16th rising; the FIFO of four, two in 32 bits;
  ICBNE, ICOV; CCPxIF every OPS + 1 captures); Sleep (CCPSLP on the SOSC) and Idle (CCPSIDL). MCCP1-3's outputs and
  every module's ICMx input on their fixed pins (MCCP3's OCM3D on RA0, the Explorer's LED D3), SCCP4-7's outputs
  through PPS (OCM4-7). Not modelled, and said when used: center-aligned PWM, variable frequency, the external input
  mode, the output modes but the steerable single output, the clocks and sync sources other than those above; not
  modelled: dead time, auto-shutdown, triggered operation, gating, the special event trigger. Tests: pic24-ccp (the
  registers, the timers, the compare modes' edges at their times, PWM's period and duty on RA0 and through PPS, the
  sync, the captures' timestamps, the FIFO and ICOV, Sleep, the warnings; LED D3 dimmed by PWM on the Explorer 16/32,
  an input's period measured by a program).
