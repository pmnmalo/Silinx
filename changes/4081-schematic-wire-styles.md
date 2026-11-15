In short:

- **Schematic wires Direct, Orthogonal or Curved:** the schematic editor's ⋮ menu's *Wires* choice draws the wires as
  straight lines (from pin to pin, or through the points clicked), as the technical drawing's horizontal and vertical
  lines (the default), or as curves; the connections and the HDL the same, undone by Undo.

In detail:

- **The schematic's wire styles (#4081):** the ⋮ menu's Curved wires tick box is now the *Wires* choice (Direct,
  Orthogonal, Curved; a ✓ on the current one, an undoable edit, in Try it and the read-only views too, as before).
  The schematic's `wireStyle` is `direct`, `curved` or none (orthogonal: older files read as before). Direct draws a
  wire straight from end to end, or through its own points (the knots a curved wire has: kept from one style to the
  other); a wire drawn by clicks keeps the points clicked; the handles bend it. Each wire keeps its rectilinear path
  (`points`), hidden in Direct and Curved: its connections, its net, Check Schematic, the VHDL / Verilog, Rearrange
  Wires / Schematic and ISE's `.sch` (written orthogonal, as before for curves) are the same whatever the style.
  The ids and labels are in `core/wire-style.js`, shared with the circuit editor (#4080). The MCP's new
  `set_wire_style` tool (`style`: `direct`, `orthogonal` or `curved`) sets it. Portuguese: Fios, Direto, Ortogonal,
  Curvo.
