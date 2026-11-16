In detail:

- **Each server call its own project's KiCad parts (#4294):** the project's parts were kept in one registry for the
  whole server. Two MCP calls (or HTTP requests) on two projects, run at once, could check, simulate or make the HDL of
  a circuit with the other project's parts, or none. Each call now has a store of its own (`server/parts-scope.js`);
  the browser, one project open at a time, keeps the module's.
