In detail:

- **The 7-series' post-place & route model of a shift register (#5466):** a LUT nextpnr made a shift register (SRL16E,
  `X_LUT_AS_SRL`) has its address on the LUT's A2 to A5, A1 and A6 tied high, whatever its `X_ORIG_PORT_A<n>` say;
  `core/xc7-routed.js` read A1 as the cell's A1 and left its A0 open (a warning, and the wrong stage read).
