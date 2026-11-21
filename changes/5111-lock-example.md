In short:

- **A new example, lock:** a combination lock made of every kind of source at once: VHDL and Verilog, a schematic, a
  state diagram, a truth table, a Petri net, an ASM chart, a digital circuit, a C and a C++ function. Type the code
  2 0 2 6 on the switches; a wrong digit locks it for 3, 6, then 9 seconds, and the third sounds the alarm.

In detail:

- **The lock example (#5111):** `examples/lock`, last of the examples: the digit's switches synchronised by a 74175 on a
  breadboard (`sync.circ.json`), the buttons debounced (VHDL), the controller's parts wired in a schematic
  (`control.sch.json`): the lock's state diagram, the code's truth table, the failures counted by a Petri net's token,
  the lock-out timer an ASM chart; the penalty's seconds a C function and the digits typed a C++ function with a
  static variable (Silinx HLS), the display Verilog. A self-checking test bench (the code, three failures, the alarm,
  reset), in VHDL and with the drawings' HDL in Verilog; Check Syntax with no warning; it runs on every board of the
  Silinx toolchain (ISE: the nightly's).
