In detail:

- **The Board Emulator's oscilloscope at rest (#5706):** its box redraws on its timer only once the simulation has moved
  on; paused, powered off or held, it draws nothing and asks for no animation frame (it redrew every 100 ms, each redraw
  an animation frame). The emulator-panels UI test expects its box after the Watch's. Tests: emu-hidden, emulator-panels
  in both interfaces.
