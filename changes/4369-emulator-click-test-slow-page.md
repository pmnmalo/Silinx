In detail:

- **The Board Emulator's short-click test on a slow page (#4369):** a button clicked is held down until the design
  saw 100 cycles of it (#3109), and a slow page's run in flight, up to a quarter of a second's cycles (#3727), may take
  the board past them before the test looks: the button then rightly up. The test reads the button with the board's
  time (never up before the 100 cycles), and a press longer than a real one is let go at once, its LED toggled; the
  nightly's failure in the ISE interface was this, not blinky's debouncers (#3922), whose design it does not use.
