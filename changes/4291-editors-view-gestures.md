In short:

- **Every drawing's view gestures are the Schematic editor's:** in the Circuit, ASM chart, state diagram, Petri net
  and Symbol editors, the RTL schematic and the FPGA view, the mouse wheel, Ctrl + wheel and a trackpad's pinch
  zoom about the pointer as smoothly as the fingers move (no more jumps of 10 or 20 % a step); a trackpad's
  two-finger scroll pans the drawing (Shift + wheel: across); two fingers on a tablet pan and pinch; the middle
  button, or Space held down with the left one, drags the drawing without selecting or moving anything.

In detail:

- **A drawing's view gestures, shared (#4291):** web/js/view-gestures.js wires the schematic editor's wheel
  (canvas-gestures.js), its two fingers (ui.js twoFingerView), and a drag of the view by the middle button or by Space
  and the left one (in the capture phase: the editor's tools see none of it) on every editor and viewer of a drawing:
  the schematic (its own Space and middle button kept), the circuit, the ASM chart (its own Space kept), the state
  diagram, the Petri net, the symbol editor (the drawing scrolled in its frame, centred by its margins so that all of
  it can be reached zoomed in; one finger on its background drags it), the RTL schematic viewer and the FPGA view (two
  fingers new to both), and the ink pad; each keeps its zoom's limits. The waveform viewer keeps its own (a time axis:
  the wheel scrolls its rows).
