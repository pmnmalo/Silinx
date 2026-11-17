In detail:

- **The Circuit editor's UI tests list #4397's new ICs (#4425):** the library's groups now hold 50 74LS gates, 17 4000
  gates and 33 sequential ICs (the flip-flops, latches and registers 7473 to 74379, 4013, 4027), which the phase 2 and
  MSI tests expect; the phase 2 test watches the 20 Hz clock tick for up to 3 seconds
  rather than 12 looks (a slow page missed its 1).
