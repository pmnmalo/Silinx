In detail:

- **The short-click test scrolls BTN0 into view (#4461):** on CI's runner the board reached below the window and the
  wait for BTN0 under its centre timed out; the button is scrolled into view first, and a timeout says what is there.
