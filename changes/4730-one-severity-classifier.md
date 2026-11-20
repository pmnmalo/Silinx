In short:

- **The same warnings and errors counted everywhere:** Yosys's and nextpnr's "Warning:" lines and a compiler's
  "file:line: warning:" now count in a process's "completed with N warning(s)" and in the MCP's run_process, and ISE's
  INTERNAL_ERROR and FATAL_ERROR lines are errors in the console, its Errors tab and the MCP.

In detail:

- **One classifier of a log's lines (#4730):** `core/log-severity.js` `severityOf(line)` is used by the console's
  `logLine`, the processes' count of warnings (`web/js/implement.js`), the MCP's `run_process` (`processMessages`) and a
  shared project's runs; the three regular expressions it replaces disagreed (start of line or anywhere, case or no
  case), and none read `INTERNAL_ERROR:` (no word boundary after `_`). The console's message parser reads
  `INTERNAL_ERROR` and `FATAL_ERROR` with their tool.
