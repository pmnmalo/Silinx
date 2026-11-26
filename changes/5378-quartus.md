In short:

- **Intel Quartus Prime implements the Intel boards on the local server (#5378):** with Quartus Prime Lite installed (on
  the computer, in a Docker image or over SSH), the DE10-Lite, DE0-CV, DE1-SoC, DE10-Nano, DE0-Nano and DE2-115 projects
  synthesize, fit, are timed and give their .sof; the Design Summary shows Quartus's reports.

In detail:

- **Intel Quartus Prime as the Intel FPGAs' back end, phase 3 of the Intel roadmap (#5378):** the MAX 10, Cyclone IV E
  and Cyclone V families are Quartus's (family.js: backEnd 'quartus', no Silinx toolchain's flow; quartusDevice).
  server/quartus.js writes build/<top>.qpf, <top>.qsf (the family, the device as Quartus names it, the top, the sources,
  the SDC, then the project's QSF pins; unused pins as inputs tri-stated), <top>.sdc (the clocks of the QSF's create_clock
  comments) and run.sh, which runs quartus_map, quartus_fit, quartus_sta and quartus_asm, finding Quartus on the PATH, at
  the Toolchain Settings' quartus.path (config.json only) or in its usual installation folders; local, docker or ssh as
  ISE's and Vivado's. Its steps are Synthesize - Quartus, Implement Design (Fit), Static Timing and Generate Programming
  File (the .sof); a project made through the MCP server runs it once trusted, and another toolchain is refused for an
  Intel device, Quartus for any other. server/quartus-reports.js reads the .summary files and each tool's last message:
  the utilization (ALMs or LEs, registers, pins, memory, DSP blocks, PLLs), the worst setup and hold slack per clock and
  its Fmax from the SDC's period, the errors and warnings, the .sof; the Design Summary shows them as Vivado's
  ("Intel Quartus Prime flow"), get_report reads Quartus's reports. Design Properties and set_design_properties lock the
  synthesis tool to Quartus on an Intel device (list_devices: "Intel Quartus Prime's flow"); the browser edition keeps the
  constraints and the checks only and says Quartus implements it on the local server. Tests: quartus (the steps, the
  project files, run.sh, the summaries and the timing, the settings, the dispatch, a full flow with Quartus's tools
  faked), mcp-intel; UI intel-boards in both interfaces and Portuguese (run in CI only).
