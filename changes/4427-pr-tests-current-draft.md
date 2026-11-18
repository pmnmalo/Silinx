In detail:

- **PR tests: whether a pull request is a draft is read as it is now (#4427):** a push followed within seconds by
  `gh pr ready` started two runs, and the concurrency group kept the one queued last, often the push's, whose event
  still said draft: `related-tests` failed on a ready pull request and nothing ran again. A first job asks the API
  (`pull-requests: read`) whether the pull request is a draft, and the plan and the verdict follow its answer, so
  whichever run survives does the right thing; a draft still runs no test and fails the check (#4166).
