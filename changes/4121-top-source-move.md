In detail:

- **New Project's top document made in `core/` (Part of #4121):** the files a Top-Level Source Type's top starts with
  (#4105), moved from `web/js/wizards.js` to `core/top-source.js` (`topSourceFiles`) as they were, the wizard writing
  them in the same order, for the MCP server's `new_project` to make them too; no behaviour changed.
