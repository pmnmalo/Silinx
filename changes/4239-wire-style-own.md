In short:

- **Live sharing: the wires' style is each participant's own:** in a shared project, choosing Direct, Orthogonal or
  Curved wires in a schematic or a circuit changes only how you see it; the owner's file keeps the owner's choice, and
  a follower's or an editor's choice is remembered for that shared project on their computer.

In detail:

- **The wires' drawing style not shared live (#4239):** a schematic's and a circuit's `wireStyle` is a view setting
  (`core/collab-model.js`: `view` of the `sch` and `circ` kinds, `viewFields`, `withView`, `withoutView`), left out of
  the shared drawing's structure, so a participant's choice sends nothing; the owner's writes keep the owner's file's
  style (the page's and the MCP server's), and so do a follower's reads and Keep a Copy. A follower's or an editor's
  Wires choice (the ⋮ menu) is their view only, never an edit, a circuit's enabled read only too, and remembered for
  that shared project (`web/js/collab-wire-view.js`: by owner, project and drawing) and applied when the drawing opens
  again; the owner's change of style leaves theirs. MCP: `follow_project` write of a drawing with another wires' style
  says it was left out. Regression tests: the collab model (unit), `follow_project`'s write, and a UI test with the
  owner and an editor (a schematic) and a follower (a circuit), both ways, in both interfaces.
