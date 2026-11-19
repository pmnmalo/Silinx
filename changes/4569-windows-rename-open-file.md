In detail:

- **Windows: a file moved into the .trash, renamed, or a project deleted while another operation has it open is
  retried (#4569):** Windows refuses to rename a file another operation has open at that moment (a concurrent read of
  it, an antivirus scan of a file just written: EPERM / EACCES / EBUSY). Writing a file over another was already
  retried a few times (`renameOver`); Delete File… into the .trash, Rename… and Delete Project were not, and failed at
  once. On a shared project, an editor's rename or deletion of a source was then not made at the owner's (the old
  file kept, its deletion's warning in the share's status). They now go through `renameOver` too
  (`server/projects.js`). It made the #4418 test of `test/mcp-collab.test.js` time out on the Windows runner.
