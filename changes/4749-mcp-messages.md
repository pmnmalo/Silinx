In short:

- The MCP's check_syntax, simulate and run_process, and follow_project's runs, return their messages as the
  interface's console has them: each one's severity, source, tool, file and line, and process.

In detail:

- **The MCP's results as messages (#4749, step 4):** check_syntax's, simulate's and run_process's results hold
  `messages` beside their other fields, as does follow_project's `ownerActivity.runs`. Each message is
  `{ text, severity, source, tool, location, action, process, run }` (`core/message.js`'s `messageData`: the action by
  its label, the text in English), made as the interface's console makes it from the same line:
  - check_syntax: each diagnostic, then the result;
  - simulate: the design's messages with their file and line, then where it stopped;
  - run_process: the errors' and warnings' lines, then the result;
  - follow_project: each line of the owner's run, with the owner's source.
- **Check Syntax's locations (#4749):** the interface's Check Syntax lines now give their diagnostic's location with its column (`diagLocation`), as
  check_syntax does.
