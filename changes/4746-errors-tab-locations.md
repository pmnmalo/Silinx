In short:

- **A simulation's assertions in the Errors tab, and every message with a file and line clickable:** a test bench's
  failed assertion (`severity error`, `failure`, `$error`) and its warnings are listed in the Errors and Warnings tabs
  with their file and line, once each; a click opens the test bench there. A process's message that names a file of
  the project (ISE's `"…/top.vhd" Line 12`, Vivado's `[…/top.v:12]`, a constraints file's `[top.ucf(3)]`, a
  compiler's `top.vhd:12:5:`) opens that file at its line, and a drawing's Check's entry shows its item in the drawing.

In detail:

- **The Errors / Warnings tabs' locations (#4746):** `core/message-location.js` reads a message's file and line
  (`messageLocation`) and finds the project's file a tool named (`projectPath`: the same path, a path ending with it,
  the only file of that name); the console's entries carry it (`located`), written once (its text's). A simulation's
  messages come from the simulator (`simDiagnostics`, source `sim`, its document's run: run again, replaced; an entry
  listed once, at most 200 a run), not from the console's copy of SSim's lines, which keeps their double-click to the
  source in the message centre. `log(…, { goto })`: a drawing's Check's entry shows its item, its drawing brought to
  the front. The MCP's `run_process` returns `locations` (its errors' and warnings' files and lines), and `simulate`'s
  log entries their file and line.
