In detail:

- The System document's edits (core/system-edit.js) check a node's id and an interface's name with the shared
  identifier rule (core/ident.js's `isName`) rather than a copy of their own; the same names are taken and refused
  (#5184).
