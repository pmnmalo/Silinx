In detail:

- **The Silinx toolchain's unexpected errors said with their type and the frame that threw (part of #5592):** in
  Firefox and Safari the console's `ERROR:Silinx - …` line left out the frame that threw; it now gives the error's
  type, its message and its stack's top 8 frames in every browser (silinx-fpga's open-flow-core.js errorText).
