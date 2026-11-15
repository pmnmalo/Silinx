In detail:

- **Regular expressions built from constants escaped completely (#3888, #4088, #4089):** CodeQL's alerts 185, 186
  and 187 (js/incomplete-sanitization): `test/classroom-template.test.js` escaped only `.` in Silinx's version,
  `test/mcp-schematic.test.js` only `(` and `)` in its messages, and the Circuit editor's Portuguese labels
  (`web/js/i18n-circuit.js`) only `(`, `)` and `+` in the parts' titles; each escapes every special character now,
  backslashes included. The titles' expression is the same (none has another special character). Tests:
  classroom-template, mcp-schematic, web-i18n.
