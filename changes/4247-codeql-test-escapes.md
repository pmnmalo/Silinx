In detail:

- **Test expressions escaped completely, the policy's sources compared exactly (#4247, #4248, #4249, #4250, #4251,
  #4252, #4253, #4254):** CodeQL's alerts 188 to 192 (js/incomplete-sanitization): `test/mcp-grade.test.js`,
  `test/mcp-new-source.test.js`, `test/ui/collab-relay.test.js` and `test/ui/new-source-paths.test.js` escaped only
  `.` in the names they build a regular expression from, and `test/symbol-standard.test.js` replaced only the first
  `&` of an IEC qualifier; each replaces every `&` and escapes every special character now, backslashes included.
  Alerts 193, 194 and 195 (js/incomplete-url-substring-sanitization): `test/static-editions.test.js` looked the
  Content Security Policy's sources up with `includes` (an array's, never a substring); it compares each source
  exactly now. The tests assert the same. Tests: mcp-grade, mcp-new-source, symbol-standard, static-editions,
  ui/collab-relay, ui/new-source-paths.
