In short:

- A System's FPGA node has its own Design Summary and reports in Implement's tree: View Synthesis Report under
  Synthesize, View Static Timing Report under Implement Design.

In detail:

- **A System FPGA node's reports (Fixes #5632):** a node's build folder's reports (`build/nodes/<id>/build/reports.json`,
  `server/system-implement.js` nodeReports; `GET /projects/:p/reports?node=<id>`) are shown by:
  - its Design Summary/Reports, its own document (`summary:<id>`, web/js/summary.js for the node: its module, device,
    board, utilization, timing, its reports' links in its build folder), read again after the node's run;
  - its steps' reports under them, in Implement's tree and in the Processes of the node's Design-pane row
    (`web/js/system-node-reports.js`); a report not made yet is said.
  The MCP's `get_report` takes `node`. Tests: `test/mcp-node-reports.test.js`, `test/ui/system-node-reports.test.js`
  (both interfaces, Portuguese), `test/ui/system-implement-tree.test.js`.
