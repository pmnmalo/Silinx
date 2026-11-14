In short:

- **Open in VS Code:** a project's HDL, C / C++, constraints or any text file opens in VS Code from its right-click
  menu in the Design pane or its tab's menu (at the cursor's line), and the project's folder from the project's
  menu; what is saved there shows in Silinx. In the server edition, on the server's computer.

In detail:

- **Open in VS Code (#4017):** the server runs the editor (`code <project folder> --goto <file>:<line>`, found on
  PATH or where it is installed, spawned without a shell), or the page opens its `vscode://file/…` link when it is
  not found; a file of the project only (its path confined, no hidden file or folder, not a design project's HDL),
  never a program of the request's, refused to a page on another computer (`GET /api/editor`, `POST
  /api/editor/open`). config.json's `editor` (file only): `code` by default, `code-insiders`, `codium`, `cursor`, a
  program's absolute path, or `off` (`SILINX_EDITOR=off` too). The MCP server's `open_in_editor` does the same. None
  in the browser edition. The UI tests' server has it off (no test starts the user's editor).
