In detail:

- **The page's state, the implementation's run slice (#4767):** the job running, Stop pressed during it and the
  synthesis's result kept for the next steps are web/js/state-run.js's, which its modules (implement.js, processes.js,
  menus.js, link-hash.js, project.js, project-rename.js, project-watch.js) read and write; web/js/app.js's `S` keeps those
  three fields as getters and setters onto it, as before.
