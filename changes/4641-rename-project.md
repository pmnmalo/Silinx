In short:

- **Rename Project…:** a project's name can be changed (File ▸ Rename Project…, the Design pane's project menu, a
  Recent Project's menu on the Start page): its folder is renamed, the project stays open with its tabs.

In detail:

- **Rename Project… (#4641):** the name checked as New Project's (a clash with another project in any case said in the
  dialog; a change of case alone is a rename); the project's folder moved whole (the local server's workspace, a
  workspace folder on the disk: copied then the old one removed; the browser's storage: its entry), a failure on the way
  leaving the old project as it was; a git repository's `.git` moved with it (its remote kept), `silinx.json`'s name, a
  `<name>.xise` kept in it, an untrusted project's mark in the workspace's repository and its GitHub record
  (`SILINX_GIT=github`, the browser edition) following it; the title, Recent Projects, the last project, the documents'
  view and cursors under the new name; the console says it. Refused, said in the console, while an implementation runs
  or while the project is shared live (or followed). The MCP server's `rename_project` does it with the same checks and
  messages (`server/project-rename.js`).
