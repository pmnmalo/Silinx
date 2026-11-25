In detail:

- **Yosys's warnings read from its log, not its console (#5604):** YoWASP's Yosys 0.71 throws at its first write
  to the console after an ABC run (its ABC runs inside Yosys and moves the standard output and error), so a
  synthesis that warns after `abc` (`synth_xilinx`'s `check -noinit`) had no result: the stopwatch and micro80
  examples, serv, picorv32. runYosysOnce now runs a script (`-q -p`, or `-p` when it runs ABC or a synth pass)
  quiet with its log in a file (`-q -l <log>`), its warnings made log lines (`logger -nowarn .`), and gives the
  caller the log's lines at the end: a quiet run's warnings as its console said them (quietLines: each once),
  then its error; another's whole log. The same lines and netlists with Yosys 0.70.
