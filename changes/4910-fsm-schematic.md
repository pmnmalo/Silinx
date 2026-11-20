In short:

- A state diagram's schematic: its gate-level implementation (the state's D flip-flops, the next-state and output logic
  in gates), not the RTL, shown read-only beside the diagram, from a Schematic badge of its row in the Design pane.

In detail:

- **A state diagram's schematic (#4910):** the textbook implementation of the machine (core/fsm-schematic.js):
  - a D flip-flop per state bit, in the diagram's encoding: FDR for a synchronous reset, FDC for an asynchronous one,
    set to the initial state's code; an inverter before them for an active-low reset;
  - the next-state and output logic in minimal gates, from one truth table (the present state bits and the inputs in;
    the next-state bits, the flip-flops' D, and the outputs out), unused codes don't cares, as Create Boolean Algebra
    writes them;
  - the state bits as net labels (`q1`, `d1`), a bus as its I/O marker and labels of its bits (`phase(2)`).
- **Where it shows:**
  - a Schematic badge on the diagram's row in the Design pane, between the drawing's and the HDL's;
  - Show Schematic Beside, in the tab's menu and in View;
  - the MCP's `related_view` with the view `schematic`.
- **When:** it is read-only and redrawn as the diagram changes. It is drawn whenever it can be: a binary or gray encoding, no
  errors, at most 10 bits of state and inputs; otherwise it is not drawn and the console says why. It works in a design
  and simulation project too.
