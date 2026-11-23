In short:
- A co-design System's waves open in the Simulate task and its emulator in the Emulate task, as a module's waves and the Board Emulator do (#5337).

In detail:
- The System's waves (syswaves:) and its emulator (sysemu:) are documents of the Simulate and Emulate tasks (web/js/tasks.js taskOfDoc), opened there with their task brought forward, no longer in Design (#5337). Tests: tasks (taskOfDoc of both), the UI's system-emu and system-sim (their task; the ISE style has none), failing on the old code.
