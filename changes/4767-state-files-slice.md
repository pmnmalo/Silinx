In detail:

- **The page's state, the project's files slice (#4767):** the project folder's files, the files shown, the constraints
  file's text, the repository's status and the queues of reloadProject and of the Design pane's commands are
  web/js/state-files.js's, which their 31 modules read and write; web/js/app.js's `S` keeps those six fields as getters
  and setters onto it, as before (the project itself stays `S.project`).
