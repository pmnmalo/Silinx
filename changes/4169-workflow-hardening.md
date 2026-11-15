In detail:

- **The update reports write only numbers and part names (#4169):** the Yosys and nextpnr update pull requests' comment
  takes a measurement of the jobs that ran the new package as outside text (#3417): a cell holds a finite number or `-`,
  a part its name or `?`; a measurement that is not a number no longer stops the report
  (`scripts/yosys-update-report.mjs` `cleanQuality`).
- **Pages after the repository's own release (#4170):** `pages.yml` runs after a `Release` run only when it is this
  repository's `.github/workflows/release.yml`, started by a push (a workflow is matched by its name alone);
  `test/workflows.test.js` checks every `workflow_run` trigger that way.
- **The ISE runner's install warns of a personal host name (#4171):** GitHub's "Set up job" step prints the machine's
  host name in every job's log, and a public repository's logs are public: `scripts/ise-runner/install.sh` warns when
  the host name looks personal (macOS's default forms) and says how to give it a generic one; the install goes on.
