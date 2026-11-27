In short:

- **The Cyclone V in the Silinx toolchain (#5377, experimental):** the DE0-CV, the DE1-SoC and the DE10-Nano implemented with
  no Quartus: Yosys, then nextpnr-mistral (the Mistral project's database), which writes the .rbf the board's FPGA is loaded
  with, on the local server when the project's synthesis tool is Silinx (Quartus stays the default there) and in the browser
  edition. Every example builds on the three boards, their 50 MHz met; the .rbf is not yet tried on a board.

In detail:

- **The Cyclone V's open flow, phase 2 of the Intel roadmap (#5377):** a back end of the Silinx toolchain
  (`open-flow-mistral.js`): Yosys's `synth_intel_alm -family cyclonev`, then nextpnr-mistral from Silinx's package
  `@silinx/nextpnr-mistral` (built for WebAssembly in nextpnr-spartan's CI, with Mistral at a pinned commit, declared in
  `PINNED`; 0.1.0, an optional dependency), which places, routes and writes the .rbf; `-nodsp`, since nextpnr-mistral places
  no DSP block yet; the QSF's pins and I/O standards given to nextpnr, its clock's period in an SDC and as `--freq` (the SDC's
  clock stays on the port's net), the clock reported by the port's name; the synthesis's ALUTs, flip-flops, carry cells, M10Ks, DSPs and clock buffers, nextpnr's utilization and
  maximum frequency in the Design Summary. Its parts are those of Mistral's e50f and sx120f dies (the 5CEBA2 / A4, the
  5CSxA5 / A6: the three Cyclone V boards'); the others stay Intel Quartus Prime's. Design Properties offers Quartus or
  Silinx on them (Quartus the default on the local server), the browser edition the Silinx toolchain; `set_design_properties`
  takes `synth_tool: silinx` there, `list_devices` marks the boards "the Silinx toolchain's too". The package is downloaded
  on its first use, as YoWASP's nextpnr packages are. Tests: mistral (the back end with a mock nextpnr: its arguments, the
  QSF and SDC it is given, the .rbf kept, the errors), quartus (the Silinx toolchain asked for on the DE0-CV), mcp-intel,
  family-profile, tool-descriptors, third-party (a package's `LICENSE-*` files in the notices: Mistral's BSD-3-Clause);
  examples-cyclone5 (every example on the DE0-CV, the DE1-SoC and the DE10-Nano: its .rbf, 50 MHz met, no warnings;
  `MISTRAL_TARGETS`; measured in docs/TOOLCHAIN.md); UI intel-boards (the synthesis tool's choices, a DE0-CV project to its .rbf, the Design
  Summary, in Portuguese; run in CI only).
