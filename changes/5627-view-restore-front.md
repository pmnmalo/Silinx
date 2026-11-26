In short:

- A document you open while a project is still opening stays in front: the project's kept documents, its Design
  Summary among them, reopen behind it.

In detail:

- **A project's kept view no longer covers a document opened meanwhile (#5627):** a project's documents reopened as it
  opens (its kept view) put the one in front of that view last, over a document the user, or a followed owner, had
  brought to the front while they reopened; on a loaded machine a follower's file was then covered by the Design Summary
  (the readonly-notice UI test's #3181 timed out waiting for the file's read-only notice). That document now stays in
  front, the kept one behind it; a first opening's Design Summary too, behind a document already in front. Tests:
  view-restore-front (new: fails on the old code with the Design Summary in front), readonly-notice #3181 under
  `SILINX_UI_THROTTLE`, both interfaces.
