In detail:

- **The Board Emulator's short-click test presses the button it reads (#4437):** the #3109 test sets the clock rate by
  its own selector, waits until the run at that rate is in and the button is under its centre before the click, reads
  the shown emulator's button, checks that the press landed and says the board's state if the button is up too soon;
  in CI's ISE interface it read the button up after 0 or 18 cycles, which no local run reproduced.
