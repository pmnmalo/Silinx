In detail:

- **Every circuit part checked against its datasheet, a repository-wide test (#4602):** `test/circuit-coverage.test.js`
  fails, naming the part, when a part of the library (its 178 ICs and 16 other parts) or a KiCad catalogue symbol's
  part has no test against a reference of its own, or when a test's table names a part that is no longer the
  library's; each group's tables are read from its test's source (`test/circuit-references.mjs`), a gap would need an
  issue in its allowlist, and the catalogue's symbols drawn only (152, 48 of them 74xx / 4xxx logic ICs) are counted,
  not failed. It is one of the repository's checks of every pull request (`REPO_WIDE`). The 8-lever DIP switch gets its
  test (its levers each on its own, through the engine and the HDL), the one part that had none.
