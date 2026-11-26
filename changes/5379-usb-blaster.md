In short:

- **The Intel boards programmed from Silinx (#5379):** Configure Target Device loads the design into the FPGA of the
  DE10-Lite, DE0-CV, DE1-SoC, DE10-Nano, DE0-Nano and DE2-115 with openFPGALoader through the board's USB-Blaster, on the
  local server; not yet tried on a board.

In detail:

- **Programming the Intel boards, phase 4 of the Intel roadmap (#5379):** Generate Programming File makes, after Quartus's
  .sof, the file openFPGALoader loads into the FPGA's SRAM (quartus_cpf, in run.sh's bitgen step): build/<top>.rbf for the
  Cyclone IV and V, build/<top>.svf for the MAX 10, whose SRAM is loaded only as an SVF (family.js bitstream; the Design
  Summary's bitstream and bitstream_info name it). Configure Target Device is Quartus's Program FPGA page (its process in the
  tree again, the board's USB, the file, a note); the server runs openFPGALoader -c usb-blaster or -c usb-blasterII (the
  DE1-SoC's and DE10-Nano's USB-Blaster II, its FX2's firmware the local Quartus's blaster_6810.hex, --probe-firmware, or a
  note when none is found), with -b where openFPGALoader names the board (de10lite, de1Soc, de10nano, de0nano; the DE0-CV
  and the DE2-115 by their cable, each a USB-Blaster by its manual). A .svf or .rbf of a project only, an Intel FPGA's file
  for another device warned. program_board does the same. The configuration flash (the MAX 10's own, the EPCS) stays
  Quartus Prime's programmer's, and the browser edition does not program these boards (the issue says why). Tests:
  program-intel (each board's programmer, run.sh's quartus_cpf, the process tree's page, program_board on the DE0-CV,
  DE10-Lite and DE1-SoC with a fake openFPGALoader, the firmware found or not, the refusals), quartus (the .rbf in the
  flow), programmer; UI intel-boards (Configure Target Device on the DE0-CV, in Portuguese too; run in CI only).
