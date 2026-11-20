In short:

- **No more dangling stubs after adjusting wires:** in the Schematic editor, a wire segment dragged onto the wire it
  continues no longer leaves a short stub sticking out of it.

In detail:

- **Schematic: the wires drawn twice over trimmed (#4920):** two wires meeting end to end, one segment of the second
  dragged onto the first wire's corner: the dragged wire's end stayed where it was, joined back by a short segment lying
  on the first wire, drawn as a stub that leads nowhere. After every edit (and as a schematic is opened, so also by the
  MCP's wire tools) the part drawn twice is now removed (`core/schwire-fold.js`, called by `normalizeDoc`): two wires
  that leave their meeting point the same way meet at the far end of the overlap instead, a stub lying on a branch of a
  junction dot and ending in nothing is removed, and a wire that turns back on itself loses the spike.
  The net names on the doubled part stay on the wire; the connections and the HDL are the same. A wire left unconnected
  on a stretch of its own stays, as does a doubled part with a pin, a marker or another wire's end on it, and a doubled
  wire that goes on from a junction dot (trimming it would move the dot back).
