In short:

- **The Errors and Warnings tabs follow the console's filter:** under Simulation they list the simulation's errors
  and warnings, not the synthesis's, and their counts too; a check's entries are listed under every filter. A shared
  project's followers see the owner's lines under the same filters as the owner.

In detail:

- **The console's typed message, its first step (#4749):** `core/message.js` (`makeMessage`: severity, source, text,
  location, action, process, run); `web/js/console.js` `log()` makes each line's message, its source decided there once
  (`lineSource` of its process's header, a writer's own), the line's element holding it and the watchers getting it;
  `web/js/messages.js` no longer reads the sources again from the lines' text (no global `cur`). The Errors / Warnings
  tabs list the entries of the sources the filter shows (`shownSourcesNow`), a filter's change bringing no tab forward.
  The runs a shared project's owner sends carry each line's source (`core/collab-runs.js`: `[text, class, source]`; the
  MCP's runs Implementation's). The processes stating their messages themselves and the MCP's results as messages are
  the next steps (the pull request's design).
