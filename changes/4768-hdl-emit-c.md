In detail:

- **The HDL generators' shared primitives, the C / HLS family first (#4768):** core/hdl-emit.js holds a width's VHDL type
  (`vhdlType`) and Verilog range (`vlogRange`), which 13 modules of the C / HLS generators (core/c-*.js, core/hls-*.js)
  each wrote with a copy of their own (29 copies); the generated HDL is the same, byte for byte. The other generator
  families follow, one at a time.
