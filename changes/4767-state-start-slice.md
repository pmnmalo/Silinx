In detail:

- **The page's state, the page's start slice (#4767):** a design link of the address opened, the address's links
  watched and the start-up's checks written are web/js/state-start.js's, which app.js and link-hash.js write;
  web/js/app.js's `S` keeps those three fields as getters and setters onto it (the UI tests wait for them there).
