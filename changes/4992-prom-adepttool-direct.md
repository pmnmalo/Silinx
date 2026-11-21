In detail:

- **CodeQL's code scanning alerts of the PROM's programming and of a UI test (#4992, #4993):** a Platform Flash
  PROM's job runs adepttool's Python itself, never through the programmers' other runner and its iMPACT wrapper (it
  ran no shell before either: the bitstream's path was already an argument as it is); the browser edition's UI tests
  of the workspace folder build their page script with no value in it (the fake folder's module at the page's
  origin).
