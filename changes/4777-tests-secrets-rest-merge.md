In detail:

- **Tests for the redaction of the owner's computer's names, and for a pull's merge through GitHub's API (#4777):**
  `test/owner-secrets.test.js` checks a Windows computer's folders (drive letters, backslashes, the configuration inside
  the home folder replaced as itself, a drive's root never) and a workspace and exchange folder outside the home folder
  (`ownerSecrets` takes the system's path functions and its folders as options, the defaults as before);
  `test/git-rest-merge.test.js` tests `core/git-rest-merge.js` on its own: the text files merged by their lines, a
  conflict waiting for its choice, removed and binary files left, a file added on both sides, a drawing merged by its
  objects and its HDL file made again, and a file renamed on GitHub or here and changed on the other side.
