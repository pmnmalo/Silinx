In detail:

- **A hidden test in the student's report (#4178):** its line is its verdict and points only, whatever its verdict (a
  Runtime Error's or a Time Limit's messages too, not only a Wrong Answer's), as docs/CLASSROOM.md says of the issues
  `silinx classroom grade --issues` opens; the teacher's own console (`silinx grade`, the Results and Exercise
  documents, the MCP's `grade`) keeps every test's messages (core/grade-report.js `textReport`'s `teacher`).
