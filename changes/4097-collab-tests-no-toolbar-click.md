In detail:

- **The live ASM chart's and Petri net's UI tests leave the side panel's field without a click on the toolbar (#4097):**
  test/ui/collab-asm.test.js and collab-pn.test.js clicked the middle of the editor's toolbar, which since its new
  tools is a few pixels from Delete selection, and with the Linux runner's fonts on it (the selected state deleted);
  the field is blurred instead.
