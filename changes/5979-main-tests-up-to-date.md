In detail:

- **Main's tests up to date with tonight's merges (#5979, #5980, #5981):** the Circuit editor's UI tests read the
  Boards group's count from the part library (core/circuit-parts.js) instead of writing it by hand (5, now 7 with the
  Pico's parts, #5898); the MCP parity map names `rename_file` (its copy) for Project ▸ Duplicate… (#5862); the
  vhdl-indent test lists the Circuit examples' report messages continued by hand (lock-circuit, stopwatch-circuit).
