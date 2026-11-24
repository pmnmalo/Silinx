In detail:

- **The System as the general case, designed (#5479):** docs/SYSTEMS.md's "The general model": a graph of typed nodes
  (FPGA, CPU boards, the PIC24, a SoC, digital and analog circuits, terminals, instruments, networks) and typed links
  (pins, transaction buses, memory-mapped buses, analog signals, networks), every other mode a profile; the node
  contract (typed ports and levels, an advance to t1, the lookahead, save and restore); a synchronous reactive model
  for the drawings' C and MicroPython; one model in two views; the build and programming plan; the PIC24 first, with
  its own emulator and MPLAB X's simulator as its oracle; the risks. Its phases are #5480–#5489.
