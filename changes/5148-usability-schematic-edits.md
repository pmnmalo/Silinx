In detail:

- **Usability tests: the schematic's other edits (#5148, its second part):** `test/usability/schematic-edit.test.js`:
  a net name and I/O markers added with their tools (their names typed in the box they ask with), two wired symbols
  copied and pasted (the copy wired the same), a wire and a wired symbol deleted (Check Schematic's warnings exactly:
  the net name left, the net with no driver), Rearrange Wires and Rearrange Schematic on the gates example (the nets
  kept, no clash), and a half adder drawn from the palette on an empty sheet; each with Undo back to the start and Redo.
  The random sequences name new wires' nets and delete new wires too.
