In detail:

- **The System as the general case, designed (#5479):** docs/SYSTEMS.md's "The general model": a graph of typed nodes
  (FPGA, CPU boards, the PIC24, a SoC, digital and analog circuits, terminals, instruments, networks) and typed links
  (pins, transaction buses, memory-mapped buses, analog signals, networks), every other mode a profile; the node
  contract (typed ports and levels, an advance to t1, the lookahead, save and restore); a synchronous reactive model
  for the drawings' C and MicroPython; one model in two views; the build and programming plan; the PIC24 first, with
  its own emulator and MPLAB X's simulator as its oracle, XC16 in WebAssembly an experiment (#5491), the emulator as a
  package of its own a proposal; the risks. Its phases are #5480–#5489 and #5491. docs/ARCHITECTURE.md's "The System:
  the general case": the profiles as its special cases, where each part sits in the layers, what exists and what is
  planned; ONBOARDING.md's code map with the System's modules.
