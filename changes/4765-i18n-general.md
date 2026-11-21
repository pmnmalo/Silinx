In detail:

- **web/js/i18n.js split under the 1000-line limit (#4765):** its general Portuguese dictionary moved as it was to
  web/js/i18n-general.js (1000 -> 607 lines), the same strings, patterns and translations as before; and
  test/code-size.test.js now holds every source file under 1000 lines, as CLAUDE.md says (it let exactly 1000 through).
