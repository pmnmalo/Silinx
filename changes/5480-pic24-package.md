In detail:

- **The PIC24 emulator's choice and place (#5480, part of #5479):** `docs/SYSTEMS.md` and `docs/ARCHITECTURE.md` say
  that LabWired's dsPIC33 model (MIT, Rust, through WebAssembly) or an emulator of Silinx's own is being evaluated
  (#5480), and that one of Silinx's own would be a monorepo package, `packages/silinx-pic24`, as `silinx-fpga` is,
  under the MIT licence (decided 2026-11-24); and that of #4695's nodes only the AVR's is built, the RP2040's and the
  ESP32's being its phase 4 (#5494, #5495).
