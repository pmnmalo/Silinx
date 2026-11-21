In short:

- **The ISE style toolbar's Emulate Behavioral Model:** a button between Simulate Behavioral Model and Configure
  Target Device opens the Board Emulator on the top module; the New ASM State Diagram button is gone (New Source…
  keeps the ASM chart).

In detail:

- **The ISE style interface's main toolbar (#5114):** no New ASM State Diagram button; an Emulate Behavioral Model
  button after Simulate Behavioral Model, the Processes pane's Emulate Behavioral Model (RTL) (the top module's Board
  Emulator), disabled with no top module or when the project's tool has no emulator, hidden in a design and
  simulation project as Implement and Configure Target Device; the Silinx interface's toolbar unchanged.
