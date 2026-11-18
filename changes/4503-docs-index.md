In detail:

- **The developers' documents apart from the user's (#4503):** `docs/README.md` sorts the documentation in two: the
  user's guide (English, Portuguese) and the documents for those who change Silinx, one line each (development,
  architecture, toolchain, quality, interface rules…). They keep their paths, which the code, the workflows (the
  weekly comparison writes QUALITY.md) and CLAUDE.md name; the README, CONTRIBUTING and ONBOARDING point to the index.
  `test/docs.test.js` checks that it lists every developers' document and that the old guides only point to the
  user's guide.
