In detail:

- **A new project's folder and adepttool's environment, one copy each (#4772):** server/new-project-dir.js makes a
  cloned project in a folder of its own and moves it into place, for Open from GitHub Repository's two clones (git's and
  GitHub's REST API); server/programmer.js `adepttoolEnv` is the programmer's and the logic analyzer's environment for
  adepttool (the analyzer's now also leaves out the library folders that do not exist).
