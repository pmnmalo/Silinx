In detail:

- **CodeQL's code scanning alerts of GitHub's record of a project and of a UI test (#4866, #4867, #4868, #4869, #4870,
  #4871, #4872):** the file that keeps what a project was at its last commit or pull (SILINX_GIT=github) is checked to
  be in its workspace's folder where the analysis sees it, as a project's folder is (the name was already checked
  first: no name but a project's ever reached it); `test/ui/collab-live-via.test.js` escapes every special character
  of the relay's host in its expected message, not only its dots.
