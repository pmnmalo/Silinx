In short:

- **Side panels resizable:** every editor's and viewer's side panel (Symbols, Parts, Ports, Properties, Board
  Resources, the Board Emulator's, the implemented design's, the timing paths', the lab's steps, the exercise's) is
  made wider or narrower by dragging its inner edge; the width is remembered, and a double-click on the edge gives
  the panel its default width back.

In detail:

- **Every side panel's width dragged (#4316):** a handle over the panel's inner edge (web/js/side-resize.js, mounted
  by `mountSideFold` and the schematic's `mountSchPanels`, so every side panel has it), dragged by the mouse, a pen or
  a finger, ← → from the keyboard when focused; between 160 and 720 px, the canvas keeping 200 px; remembered per
  panel (`silinx.<editor>.<panel>.width`); a double-click restores the default width. Folded, the panel keeps its
  strip and has no handle; on a narrow screen (the panel over the canvas behind ☰) the handle works too, the panel at
  most 90 % of the editor. The width is the view's only: no MCP tool.
