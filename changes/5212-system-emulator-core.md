In detail:

- The System Emulator's core (core/system-emu.js): a co-design System's boards emulated through the scheduler, each FPGA
  node's board the Board Emulator's (its switches and buttons the inputs no link drives, its LEDs and display its
  outputs watched, shown as the Board Emulator shows them), an Arduino's pins and its LED L; the scheduler's `watch` of
  outputs no link reads; the System's worker's `init { emulate }`, `set` and the boards' state in each `state` (#5212).
