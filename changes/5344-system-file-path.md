In detail:

- **A new co-design project's System document written through the project's path check (#5344):** `createProject`
  writes it with `safeJoin`, as every other project path, instead of a plain `path.join`. Its name is the project's,
  already limited by the project name's rule, so no path could leave the folder; the check now says so where CodeQL
  sees it. Test: codesign-system-file (the document in its folder; names with `..` or a separator refused, nothing
  written).
