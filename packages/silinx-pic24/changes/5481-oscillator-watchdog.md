In detail:

- **The device, its oscillator and its watchdog (#5481):** `Pic24Mcu` (mcu.js), the core with its peripherals' SFRs
  (their reset values, their writable bits, their hooks), its time in ps as its clock changes, RCON's reset flags
  (POR, BOR, SWR, WDTO, IOPUWR, SLEEP, IDLE, kept through the resets but a power-on's); `createGb610` (gb610.js), the
  PIC24FJ1024GB610 assembled; `Pic24Node` on it. The oscillator (osc.js): the FRC, the primary oscillator (the
  Explorer 16/32's 8 MHz crystal, FOSC's POSCMD), the SOSC, the LPRC, the DCO (DCOCON), the 96 MHz USB PLL's 32 MHz
  branch through CLKDIV's CPDIV and the 4x / 6x / 8x PLL, the divided FRC (OSCDIV), DOZE, OSCCON's unlock sequences
  (NOSC, OSWEN, IOLOCK with FOSC's IOL1WAY, CLKLOCK), the clock switch as FOSC's FCKSM allows it. The watchdog (wdt.js):
  FWDTEN (always, software by RCON's SWDTEN, active only), its period from the 31 kHz LPRC (FWPSA, WDTPS), CLRWDT, its
  window (WINDIS, WDTWIN), its time-out's reset or its wake-up from Sleep and Idle. Not modelled: the oscillators'
  start-up and the PLL's lock times, OSCTUN and the FRC's self-tune, the Fail-Safe Clock Monitor, REFO, two-speed
  start-up, the watchdog's clock sources other than the LPRC. readConfig no longer says the watchdog is not
  emulated. Tests: pic24-osc (the clock at reset, CPDIV, OSCDIV, DOZE, the switch and its refusals, IOLOCK, the time
  across a change of clock, the watchdog's period, reset, CLRWDT, software enable, window, wake-up, RCON's flags).
