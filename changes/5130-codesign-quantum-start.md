In detail:

- Co-design's scheduler (core/system-sim.js) starts every link active for its hold, so that a run's first windows are
  fine ones: an AVR's D1, floating until its USART is on, no longer reaches the FPGA's receiver as a 100 µs start
  bit with the adaptive quantum, and the first byte is no longer lost (`HiIjJk` as with a fixed latency) (#5130).
