In short:

- **A branch per person, and Merge Branch…**: in a project in a GitHub repository, each person of a group works on a
  branch of their own (File ▸ Git ▸ New Branch…, Switch Branch…, also in the Collaboration tab), and Merge Branch…
  merges another person's branch into theirs as Pull does: a drawing by its objects, a file by its lines, the
  conflicts chosen in the merge view.

In detail:

- **Git's branches (#4213, phase 4 of #4204):** New Branch… (made from the last commit, its name checked as git checks
  it, the project on it, its changes kept), Switch Branch… (a branch only GitHub has made here, following it; the
  changes committed first, the other projects' of the workspace's repository too; what it brings passes the import gate) and Merge Branch… (GitHub's version of the branch
  when it is newer; the merge of a pull, `server/git.js` `mergeCommits`, its conflicts resolved in the merge view of
  #4214 and the drawings' dialog, then a merge commit), in the server editions through the system's git
  (`server/git-branch.js`) and in the browser edition through GitHub's REST API (`core/git-rest-branch.js`: the
  branches listed, a branch made on GitHub, the two branches' merge base from GitHub's compare, a merge commit with both
  parents). The MCP server's `git_branch`, `git_switch` and `git_merge` do the same, through the same functions and
  messages.
