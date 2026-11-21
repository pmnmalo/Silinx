In short:

- The local server stays quick with big projects: the projects' list, the watch of an open project and the pages'
  requests no longer read every file or the settings one after another.

In detail:

- **The projects' listing, the watcher and the per-request reads without holding the server (#4775):** a project's
  last change (the projects' list) and the watcher's look at an open project read its folders and stat its files a few
  at a time (`server/concurrent.js`), not one after another; a project whose look is slow is looked at less often (its
  looks four times their length apart at least, a quick one still every 500 ms); `config.json`'s settings read per
  request (the relay's, a page's Content-Security-Policy, the MCP server's remotes, the ISE work folder) are read and
  parsed once per change of the file; a cloned project's trust mark is read asynchronously.
