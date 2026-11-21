In short:

- The application's console lines follow the interface's language when it changes: they are drawn again in the new
  language, their buttons too.

In detail:

- **The console's lines translated where they are drawn (#4749, step 5):** an application's line (`logError`,
  `logWarning`, `logInfo`, a command's error, warning or information, `appLog`'s) keeps its English as its message's
  text, what a shared project's followers and the MCP get, and is drawn translated, its `ERROR:` / `WARNING:` /
  `INFO:` tag kept (`web/js/console.js`: `appText`, a writer's own `draw`); its entry of the Errors / Warnings tabs
  is shown in the language too, its message English. A change of language draws every such line, and every line's
  buttons, again from their English. A tool's output is never translated.
