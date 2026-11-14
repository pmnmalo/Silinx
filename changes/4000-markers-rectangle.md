In short:

- **Many I/O markers at once:** in a schematic, drag a rectangle with the Add I/O Marker tool and every open pin and
  wire end in it gets a marker, named in1, in2… and out1, out2… (io1… for a bidirectional pin), skipping the names the
  drawing already uses. A click still adds one marker, as before.

In detail:

- **The Add I/O Marker tool's rectangle (#4000):** each marker takes its pin's direction and width (a bus pin:
  `in1(7:0)`), turned the way the pin points; a wire end takes the direction of the pins on its net, or the net's name
  when it has one. The default names take the first number no marker, net name or instance uses, in any letter case
  (a gap is filled first, as for one marker). A wire end whose direction cannot be known (no symbol's pin on its net),
  or whose net already has a marker, is skipped. The console says how many markers were added, and which ends were
  skipped and why. The whole rectangle is one Undo step. The logic is in `core/schmarker-many.js`.
- **MCP:** `add_markers` adds the markers to every open pin of an instance or of a region, with the same names and
  messages.
