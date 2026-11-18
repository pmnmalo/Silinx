In short:

- **The user's guide in Portuguese:** every page of the guide (what Silinx is, getting started, designing, simulating,
  the Board Emulator, boards and toolchains, teaching, AI assistants, questions and answers) has its Portuguese twin,
  with the screenshots of the interface in Portuguese, and the README has its Portuguese version, README.pt.md.

In detail:

- **The user's guide in Portuguese (#4502):** `docs/user/pt/`, one page for each English one of the guide, each
  linking the other at its top; COMECAR.md became `docs/user/pt/getting-started.md` (the old file points there). The
  reference pages (the features, the toolchains, circuits, grading, GitHub Classroom, Silinx HLS) stay in English,
  linked from the Portuguese pages as such. `README.pt.md` beside the README. Five more screenshots in Portuguese
  (New Project, Boolean algebra, a simulation, the Board Emulator, the Design Summary): the script takes the menus'
  and processes' Portuguese names and waits for a process by its status. `test/docs.test.js` checks that every page
  has its twin, each linking the other, and its link check is case-sensitive.
