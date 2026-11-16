In detail:

- **A drawing's view gestures in a module of their own (#4291, #405):** the schematic editor's wheel (zoom about the
  pointer, as smoothly as the wheel or the pinch moves; a trackpad's scroll pans) moved as it was from
  web/js/sch-mouse.js to web/js/canvas-gestures.js, for the other editors to share; no change of behaviour.
