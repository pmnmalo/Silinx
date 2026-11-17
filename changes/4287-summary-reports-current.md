In short:

- **Design Summary:** after a run, its Detailed Reports always show the run's reports as Current, never the summary
  drawn before the run.

In detail:

- **The Design Summary drawn with the reports as they are when it is opened (#4287):** its refreshes are numbered and
  only the latest draws, an older one answered after it (older reports) dropped; Design Summary (`openSummary`)
  resolves once the summary is drawn, not before its reports are read. The UI test gowin-device (#2303) read the table
  drawn at the project's opening, its Status column empty; test/ui/summary.test.js holds the reports' requests and
  answers them out of order.
