In short:
- The lock example builds in ISE: its top's second tick no longer has the name of its generic TICK.

In detail:
- examples/lock/src/top.vhd's signal tick renamed sec_tick: VHDL's names ignore case, and an entity and its architecture are one declarative region, so XST refused it as a redeclaration of the generic TICK (HDLParsers:1202, HDLCompiler:32) on every device (#5180). The ISE project flow's test expects the export's notes on lock's schematic, whose blocks are the project's own modules, built by ISE from their HDL sources with the .sym the export writes.
