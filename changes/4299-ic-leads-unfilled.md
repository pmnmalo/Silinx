In short:

- The Circuit editor's Show inside draws an IC's leads as lines again, with no black triangles between a pin and its
  gate.

In detail:

- **Show inside: an IC's leads unfilled (#4299):** the leads from a gate IC's pins to its gates' inputs and from their
  outputs to their pins (#4224) are bent polylines, and their style set no fill, so SVG's default black fill closed
  each one into a black triangle or polygon (in both themes, both symbol standards, the print and the exported image).
  Each lead is drawn with `fill="none"` and the editor's style of the leads (`circ-gate-line`) sets `fill: none`.
