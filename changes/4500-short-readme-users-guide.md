In short:

- **A shorter README and a user's guide:** the README is now a short page with screenshots of Silinx (what it does,
  the boards, how to try it), and the documentation is a user's guide of short pages, one subject each: what Silinx
  is, getting started, designing, circuits, simulating, the Board Emulator, boards and toolchains, teaching, AI
  assistants, questions and answers.

In detail:

- **The README, a landing page (#4500):** 103 lines instead of 988: what Silinx is, a screenshot, six features each
  with its own, the boards, Try it, the documentation's links, the licence. The full list of features moved to
  `docs/user/en/features.md`, the ISE, Vivado and programming sections to `docs/user/en/toolchains.md`, the MCP
  server's to `docs/user/en/ai-mcp.md`, and the developers' sections (running from the source, the command line, the
  standalone edition, the layout) to `docs/DEVELOPMENT.md`.
- **The user's guide as short pages (#4501):** `docs/user/en/`: an index, what Silinx is, getting started (from
  GETTING-STARTED.md), designing, circuits (from CIRCUITS.md), simulating, the Board Emulator, boards and toolchains,
  teaching (with grading and GitHub Classroom, from GRADING.md and CLASSROOM.md), Silinx HLS (from c-to-hdl.md), AI
  assistants and a FAQ, each with its screenshots. The old files point to their new place. `test/docs.test.js` reads
  every Markdown file under `docs/` (its links, menu paths and facts), and its facts about the toolchain from the new
  pages.
