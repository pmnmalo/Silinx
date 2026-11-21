In detail:

- **The page's state, the C sources' slice (#4767):** the C sources' black boxes and failures (what the console already
  said of them too) are web/js/state-c.js's, which its modules (c-source.js, design.js, processes.js, related-docs.js,
  app.js) read and write; web/js/app.js's `S` keeps those four fields as getters and setters onto it, and a project opened
  or closed resets the failures through it, as before.
