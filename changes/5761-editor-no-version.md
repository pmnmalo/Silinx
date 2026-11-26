In detail:

- **An editor's commands keep no version on its page (#5761):** in a project shared live, an editor's Remove from
  Project and Delete File no longer try to keep a version of the project first (the follower's backend refused it, and
  said so as a warning): the owner keeps the project's versions (`web/js/versions.js` versionBefore). The automatic
  versions' unit test no longer depends on timings of tens of milliseconds (#5768). Tests: collab-sources (both
  interfaces, its warnings asserted: none), server-versions.
