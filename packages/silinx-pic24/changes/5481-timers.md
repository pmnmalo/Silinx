In detail:

- **Timer1 to Timer5 (#5481):** timers.js, TMRx counting the peripheral clock (Fosc / 2), or Timer1 and the others
  with TCS the SOSC's 32.768 kHz or the LPRC's 31 kHz, through the prescalers (1, 8, 64, 256); at TMRx = PRx the next
  count resets it and sets its flag (T1 IRQ 3, T2 7, T3 8, T4 27, T5 28); a value past PRx runs to the end and wraps;
  Timer2 / 3 and Timer4 / 5 as 32-bit timers with T32 (TMR3:TMR2 against PR3:PR2, Timer3's interrupt, TMR3HLD
  latched by a read of TMR2 and taken by its write); asleep only Timer1 on the SOSC unsynchronised counts (and its
  interrupt wakes the device), in Idle TSIDL stops a timer. A timer counts lazily, its period's end a clock event.
  An interrupt below or at the IPL (or with GIE clear) now wakes the device from Sleep too, as the data sheet says.
  Not modelled: the external clock inputs (T1CK, TxCK), TGATE, TSYNC's delay. Tests: pic24-timers (the periods and
  prescalers, the SOSC and LPRC clocks, the wrap past PR, the 32-bit pair and TMR3HLD, Timer4 and 5 apart, Sleep,
  an interrupt-driven program counting Timer1's periods).
