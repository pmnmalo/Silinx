In short:

- **Circuits, wires edited:** a selected wire's ends and bends have handles: drag an end to another hole or pin to
  reconnect it, drag a bend, drag a segment's middle to add a bend, double-click a bend to remove it.

In detail:

- **A wire's end moved (#4930) and its shape (#4931):** core/circuit-wire-edit.js (`moveWireEnd`, `setWireBends`,
  `dragWireHandle`, `removeWireBend`), the editor's handles (web/js/circuit-wire-drag.js, drawn over the parts, one
  edit each for Undo) and edit_circuit's `reconnect` and `reshape` operations; the wire's colour and id kept, in every
  wire style.
