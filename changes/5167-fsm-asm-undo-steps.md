In short:

- **State diagram and ASM chart: one Undo step per action:** two drags, two adds or two connects soon after each
  other are undone one at a time; only what is typed in one field is one step.

In detail:

- **State diagram and ASM chart editors: separate edits no longer merged into one Undo step (#5167):** a commit's
  merge key names the field being typed in and its object (`cond:t3`, `sname:s2`, the boxes nudged); a drag, an add, a
  connect, a delete, a paste, a choice in a list commit with no key, each its own step.
