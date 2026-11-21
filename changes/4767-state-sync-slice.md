In detail:

- **The page's state, its first slice (#4767):** the drawings' HDL kept in step (what is out of step, stale or clashing,
  and what was already said) is web/js/state-sync.js's, which its modules (drawings.js, design.js, processes.js, app.js)
  read and write; web/js/app.js's `S` keeps those five fields as getters and setters onto it, and a project opened or
  closed resets them through it, as before.
