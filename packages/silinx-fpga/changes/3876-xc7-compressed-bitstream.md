In short:

- **The 7-series' .bit compressed:** `bitstreamXc7(frames, db, { compress: true })` writes the compressed form in the
  packets of Vivado's, where the XDC sets `BITSTREAM.GENERAL.COMPRESS TRUE` (the Digilent boards' configuration): 270 to
  350 KB for the examples on the xc7a35t instead of 2.19 MB. The open flow writes it when its constraints ask for it.

In detail:

- **A compressed 7-series bitstream (#3876):** `src/fpga/xc7/bitstream.js` writes every frame once, as Vivado 2025.2's
  compressed `.bit` does (read on the xc7a35t and the xc7a100t). FDRI's last frame stays in the frame buffer (UG470's
  pipeline), and a multiple frame write copies it: CMD MFW, 12 NOPs, an MFWR of 8 words to the buffer's own frame, then a
  FAR and an MFWR of 4 words for each other frame (2 NOPs after each MFWR of the block RAM's frames). The frames whose
  words no other frame of their row has go in runs within a column, each followed by the next frame's words (left in the
  buffer); each set of equal frames of a row is copied so; CTL1's bit 12 is set before the frames and cleared after LFRM.
  Not asked, the `.bit` is as before, Project X-Ray's byte for byte. The open flow's Generate Programming File compresses
  when the XDC's `BITSTREAM.GENERAL.COMPRESS` is `TRUE` (`report.bit.compressed`; the log's line says so).
- **The readbacks read it:** `readBitXc7` and `readBitFramesXc7` hold FDRI's last frame in the frame buffer, which an MFWR
  writes after a CMD MFW, to the FAR or, with no FAR after FDRI's, to that frame's own address (an error with no CMD MFW
  before it, or for a FAR off the part's frames). Checked with Vivado: its compressed and uncompressed `.bit` of the same
  design read back to the same frames on both parts; the examples' compressed `.bit` reads back to their frames and its
  round trip against the FASM is clean.
