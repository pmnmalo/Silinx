In detail:

- **A debounce and a download, one copy each (#4772):** web/js/debounce.js (a call a moment after the last of a burst,
  with cancel and flush) for the three handwriting dialogs' reading, the composition tab's refresh and the schematic
  view's refit; web/js/download.js (`downloadUrl`, `downloadBlob`) for Export Project, the print dialog's PNG, the
  waveform's VCD, iMPACT's PROM backup and Implement's bitstream in the browser edition (the VCD's URL now revoked after
  5 s, as the others').
