In detail:

- **The page's state, the documents' slice (#4767):** the open documents and the one in front are
  web/js/state-docs.js's, which their 30 modules read and write; web/js/app.js's `S` keeps those two fields as getters
  and setters onto it, as before.
