In short:

- A page left open while Silinx is updated says so in the console and offers to reload, rather than failing every
  request.

In detail:

- **The HTTP API's names and a version header (#4754):** the routes of a project that took it in their body take it in
  the address, as every other project's route, its lock with it: `POST /projects/:p/program`, `/projects/:p/prom`,
  `/projects/:p/editor/open` (the older `/program`, `/prom`, `/editor/open` with `{ project }` kept). The imports are
  `POST /import-zip?name=` and `/import-xise`, and an import takes the lock of the project it makes, never of a project
  named `import-zip` (the older `/projects/import-zip` and `/projects/import-xise` kept). Merge Contribution… sends its
  choices and label with the zip in a JSON body, not in a header (refused past 16 KB; the older form kept). `POST /gist`
  takes `expiresDays` (`expires_days` kept). The page sends its version (`X-Silinx-Version`), and a server of another
  version answers with its own, even with a refused token: the page says it in the console and offers a reload
  (web/js/stale-page.js); a client that names no version is told none.
