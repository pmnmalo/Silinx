In detail:

- **The pull requests' check waits less in the runners' queue (#4166):** at most 6 parts of a pull request run at
  once (`max-parallel`: the parts stay planned at about 20 minutes, under their 60-minute limit, where 6 longer parts
  of the whole suite would take 58 each); a draft runs no test and fails `related-tests`, the tests running when it
  is marked ready (`gh pr ready`); and a hub (`HUBS` in `scripts/related-tests.mjs`: web/js's modules imported by 15
  page scripts or more, `i18n.js`, `app.js`, `ui.js`, `drawings.js`…) selects only its own UI test, not those of its
  importers nor those that name it (`import('/js/i18n.js')`), which the nightly runs: Settings ▸ Schematic Symbols'
  pull request (#4113) selected 210 UI tests in 4 parts, now 24 in 1.
