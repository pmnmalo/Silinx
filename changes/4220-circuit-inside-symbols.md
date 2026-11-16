In short:

- The circuit editor's Show inside draws the chips' gates in the standard of Settings ▸ Schematic Symbols: IEEE
  distinctive shapes by default, or IEC boxes.

In detail:

- **Show inside in Settings ▸ Schematic Symbols' standard (#4220):** the gates inside a gate IC were always IEC
  60617-12 boxes; they follow the setting (#4113): IEEE Std 91-1984's distinctive shapes (the default), each turned
  toward its output pin, a bubble on an inverting one, or the IEC boxes as before; an open circuit is drawn again
  when the setting changes. `core/symbol-standard.js`'s `ieeeGate` draws a shape in a box. The breadboard's look is
  unchanged. Tests: `symbol-standard` (the shapes), UI `circuit-inside-symbols` (new: both standards, changed with the
  circuit open), `circuit-look`, in both interfaces.
