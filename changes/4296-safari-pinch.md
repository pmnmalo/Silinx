In short:

- **A trackpad's pinch zooms every drawing in Safari on the Mac:** the schematic, circuit, ASM chart, state diagram,
  Petri net and symbol editors, the RTL schematic and the FPGA view zoom about the pointer as the fingers spread, as
  in Chrome and Firefox; before, Safari zoomed none of them.

In detail:

- **Safari's pinch (#4296):** macOS Safari sends a trackpad's pinch as gesture events (gesturestart, gesturechange,
  gestureend, their `scale`), not as a Ctrl + wheel. canvas-gestures.js's safariPinch zooms by each gesturechange's
  scale over the last one, about the pointer, the page itself not zoomed; where a browser sends a Ctrl + wheel too,
  the first of the two to come in the gesture zooms, the other is dropped; on iPadOS, whose two fingers on the screen
  send gesture events too, these are twoFingerView's (a finger down on the drawing: the gesture events zoom nothing),
  its trackpad's pinch the gesture events'. web/js/view-gestures.js wires it on every drawing.
