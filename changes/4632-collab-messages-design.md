In short:

- **The Collaboration tab's messages under Design:** git's, GitHub's, live sharing's, the relay's and Share Project…'s
  links' messages now show under the console's Design filter, not under All only.

In detail:

- **The collaboration's messages in the console's Design filter (#4632):** the Collaboration tab is the Design pane's, but
  its messages took the source of the last process run (or the application's), so the Design filter hid them. Every
  collaboration module (git: clone, commit, push, pull, branches, merges; GitHub's sign-in and GitHub Checks; live sharing:
  share, follow, the editors' edits, who is in; the Cloudflare relay's set-up and checks; Share Project…'s links and short
  links; Short Links…; Open from GitHub Repository…'s list of repositories) now writes through one helper, `collabLog` (`web/js/collab-log.js`), whose lines keep Design's
  source whatever process ran before (`log()`'s new `src`, kept by `web/js/messages.js`); `test/collab-log.test.js`
  checks that every collaboration module writes through it. Their errors and warnings are listed in the Errors and
  Warnings tabs as before. A shared project's runs, mirrored to its followers, keep their processes' sources.
