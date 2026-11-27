In short:

- A schematic's I/O marker given another marker's name (a copy, L_1, renamed L) is refused, the console saying how to use
  the port in other places (a net name of its name), instead of joining two markers L and leaving three errors each.

In detail:

- **Two I/O markers of one name (#4998):** an I/O marker is a port of the module, drawn once (ISE's). The Properties
  panel refuses a marker's name that another marker has, with a console warning, as Rename… does in its dialog; the
  Join dialog (#2170) is no longer offered for a net named by a marker of that name (`core/schmarker.js` `markerJoin`);
  the reason, in both, says to give the other wires the net name instead (`core/schname.js` `renameError`). A schematic
  that has two markers of one name gets one error for the extra one, saying the same, no longer "net 'L' has 2 drivers"
  and "I/O markers 'L' and 'L' are on the same net" beside it (`core/schdoc.js`, `core/schdoc-hdl.js`); in Portuguese too.
