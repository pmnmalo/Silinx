In short:

- A drawing's HDL file now ends with a `silinx-sync` line, the hashes of its drawing and of its own text: an HDL file
  edited by hand is noticed, kept in a project version and made again from its drawing, which is always its source.

In detail:

- **A drawing's HDL file as a cache checked by hashes, its core (#5872, part 1):** `core/hdl-cache.js` gives a
  drawing's canonical hash (its JSON with its keys in order, its link aside) and the line every generated HDL file now
  ends with, `-- silinx-sync drawing:… hdl:…` (`//` in Verilog): the last line, so that the HDL's line numbers and its
  first lines' `silinx-symbol` marks stay where they were. `core/drawing-sync.js` writes it with the HDL (`syncDrawing`,
  `adoptDrawing`, a drawing put in another language) and reads it: an HDL file changed outside Silinx is kept in a
  version (reason `before-regenerate`, named "<file> changed outside Silinx") and made again from its drawing, with a
  warning; a file with no line (a project made before) is stamped quietly when its text is its drawing's, else kept in
  a version first; a drawing's layout changed rewrites only the line. `checkDrawings` checks every drawing of a
  project at once (its line's hashes: nothing made for a file that is its drawing's as it is), the drawings with errors
  left stale as before (#5799). The examples' and test designs' generated HDL files carry the line. The check points
  (opening a project, the folder's changes, before every flow) and the symbols follow in the next parts.
