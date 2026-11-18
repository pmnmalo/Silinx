In short:

- **Open synthesis:** a flip-flop whose asynchronous control is a net assigned a constant (`wire n = 1'b1;` into a
  preset) synthesizes; Yosys stopped with "Multiple edge sensitive events".

In detail:

- **Open synthesis: a constant net into an asynchronous control (#4332):** the flattened Verilog reads a net driven
  by one constant as that constant (#14), in the flip-flop's condition but not in its event list, so Yosys's proc
  found an edge with no branch of its own. A net a process is sensitive to an edge of (a clock, an asynchronous
  control) is no longer folded: both read the net, and the flip-flop is the one of `.pre_n(1'b1)`.
