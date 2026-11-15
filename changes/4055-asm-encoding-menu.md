In short:

- **ASM chart editor:** the state encoding is a choice of the toolbar's ⋮ menu, as the state diagram's, no longer a
  selector in the toolbar.

In detail:

- **The ASM chart's state encoding in the ⋮ menu (#4055):** the toolbar's "Encoding:" selector is gone; the ⋮ menu has
  its Encoding title, then Binary, Gray, One-hot and Enum / auto, a ✓ on the chart's (menuChoice, as the state
  diagram's, #3289), moved by Undo and Redo; the encoding stays in the status line (#2763). Test: UI
  asm-editor-chrome in both interfaces and Portuguese.
