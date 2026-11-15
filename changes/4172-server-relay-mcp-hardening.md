In detail:

- **The local server serves only the app's assets from the package folders (#4172):** from `/core`, `/packages` and
  `/vendor` (whole package folders, on the origin that holds the server's token) it serves no document (HTML, SVG, XML,
  PDF) nor a folder's index, and every response but a script's carries `Content-Security-Policy: default-src 'none';
  sandbox` (a script keeps none: ELK's worker runs under its own response's CSP).
- **A follower's presence rate-limited (#4173):** in a live-shared room (`core/collab-room.js`: the server's relay and a
  room the owner's page hosts) a follower's awareness frames (who they are, what they look at) are at most 8 KB, 10 a
  second after a burst of 40; the rest are dropped and the follower is told once ("Follow a shared project: … some were
  not passed on").
- **More MCP results labelled "Untrusted content" (#4174):** `git_status`, `git_pull`'s files and warnings, `grade`'s
  run, `timing_paths`, `related_view`, `read_symbol`, and `check_drawing`'s and `check_constraints`'s problems: they
  hold a project's or a remote's own names and text.
