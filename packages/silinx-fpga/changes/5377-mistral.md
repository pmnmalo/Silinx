In detail:

- **The Cyclone V's back end (#5377):** `open-flow-mistral.js` (`MISTRAL_STEPS`, `MISTRAL_PARTS`): `synth_intel_alm -family
  cyclonev -nodsp`, nextpnr-mistral through `io.nextpnr.cyclone5` (`mistralIo`, `nextpnrMistralNode`: `@silinx/nextpnr-mistral`,
  an optional dependency), which writes the .rbf; the QSF's bits renamed as nextpnr names them (led<0> -> led[0]), its
  clocks an SDC and `--freq`, the report's clock net (`clk_MISTRAL_IB_PAD_O_MISTRAL_CLKBUF_A_Q`) by its port's name. FAMILY_INFO's cyclone5 has `openParts` (the parts of Mistral's e50f and sx120f), `noOpenFlowMessage` names
  Quartus for an Intel part. Tests: mistral, silinx-fpga-api.
