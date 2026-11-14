In short:

- **No "Add to project" checkbox in New Source.** Its File Name and Location page no longer shows a box that was
  always checked and could not be changed: a new source is always added to the project.

In detail:

- **New Source's File Name and Location page without its "Add to project" checkbox (#3890).** The checked, disabled
  box is gone, and its Portuguese translation, which nothing else used. The MCP tool `new_source` had no such option
  (a new source is always in the project) and is unchanged. test/ui/new-source-no-add-box.test.js checks every type's
  page, in English and in Portuguese, and that the source made is in the project.
