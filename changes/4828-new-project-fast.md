In short:

- **A new project's Optimization is Fast:** Process Properties ▸ Optimization of a new empty project (New Project, the
  MCP server's `new_project`) starts at Fast instead of Area; existing projects and the examples keep theirs.

In detail:

- **A new project's Optimization Fast (#4828):** a new empty project's `silinx.json` stores Optimization Goal Speed at
  Effort Normal (Optimization Fast), the same for the local server and the browser edition (`core/project-defaults.js`,
  `NEW_IMPL`), and its `.xise` says so; Area (Goal Area, Effort High) was the default before. A project keeps the setting
  it stores, a project from an example the example's (Fast), and a project that stores none (made before the
  Optimization) reads as Fast, as before. The synthesis effort's default stays Normal.
