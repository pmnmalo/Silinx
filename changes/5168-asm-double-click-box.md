In short:

- **ASM chart: a double click on a box** selects its text in Properties to be typed over, instead of adding a new
  state where it was.

In detail:

- **ASM chart editor: a double click on a box focuses its field (#5168):** the svg captures the pointer, so the
  dblclick's target was the svg and a state was added; the box of the last press is used.
