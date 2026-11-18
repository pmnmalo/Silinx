In short:

- **An instance's Width defines its pins:** a module's instance given a Width of 8 keeps its pins 8-bit buses when a
  wire is connected to them, before or after: the wire, its net name and an I/O marker added on the pin adapt to it. A
  pin on a net already 1 bit wide (a 1-bit marker, another symbol's pin) is shared by the copies, and Check Schematic
  says so, unless it is ticked in Shared pins.

In detail:

- **An arrayed instance's pins sliced whatever is wired to them (#4451):** an instance's width defines its pins' (core/sch-array.js
  `sliceArrayed`): each pin is a bus N times its width unless its net's width is fixed elsewhere (an I/O marker, a net
  name with a range, another symbol's pin) at another; a pin on a net fixed at its own width is still shared by the
  copies, as ISE's, now with a warning ("pin C is shared by its 8 copies: its net 'clk' is 1 bit wide; tick it in
  Shared pins, or connect it to a 8-bit bus"), none when ticked in Shared pins; an ISE schematic imported ticks those
  pins. An I/O marker added on such a pin (the Add I/O Marker tool, its rectangle, the MCP's `add_markers`) is N × w bits
  wide; a net of a sliced pin is declared N × w bits wide in the HDL even when its module's port has a type
  (`std_logic`). The MCP's `place_instance` and `set_instance_width` say the warnings as Check does.
