In short:

- **Circuits, the 7475 inside:** Show inside draws the 7475, 7477 and 74375 as their datasheets do: four D latches,
  each with its D, G, Q (and Q̅), the enable of each pair wired to both.

In detail:

- **The latches sharing an enable drawn as their datasheets (#4934):** core/circuit-inside-drawn.js, the 7475's
  connection diagram (its four latches, the enables 1-2 and 3-4 between their pairs, a dot, their crossings hopped), the
  7477's and the 74375's; IEEE and IEC labels (D, G, Q, Q̅; 1D, C1); a KiCad part behaving as one drawn the same. The
  review of every IC's inside is on the issue; the flip-flops and registers sharing a clock are next (#4951).
