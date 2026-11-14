In short:

- **Two tabs on two projects:** reloading a tab reopens that tab's own project, not the one another tab opened last.
  A new tab still opens the last project used.

In detail:

- **The project reopened at start-up is the tab's own (#3952):** the open project is kept in the tab's sessionStorage
  as well as in localStorage, and the start-up reads the tab's first. A tab that closed its project reopens none when
  reloaded; a new tab, which has no project of its own, opens the last one used, as before.
