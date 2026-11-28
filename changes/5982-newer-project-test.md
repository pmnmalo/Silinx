In detail:

- **The newer-project UI test reads the project's version from the code (Fixes #5982):** `test/ui/newer-drawing.test.js`
  expected "this one reads up to 1" for a project a newer Silinx saved, which silinx.json version 2 (#5907) changed. It now
  writes a version one past `PROJECT_VERSION` (`core/doc-format.js`) and expects that, so the next version needs no edit.
