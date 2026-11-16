In short:

- **Live sharing, circuits:** a breadboard circuit is edited live by the owner and the editors of a shared project, as
  the other drawings are: each one's changes merged part by part and wire by wire, each one's own Undo.

In detail:

- **The circuit edited live (#4203):** `.circ.json` is one of the drawings shared as a structure of its own
  (`core/collab-kinds.js`, `core/collab-model.js`: its parts and wires by id). Its parts' ids are names (the HDL's
  ports, the labels), so a new part whose id another participant took meanwhile gets the next free one of its
  sequence (U4, never U3~x). The circuit editor is bound like the others (`setShared`, `applyModel`, `busy`), and the
  owner's page writes the merged circuit and makes its HDL again.
