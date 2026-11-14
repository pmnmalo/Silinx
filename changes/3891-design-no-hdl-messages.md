In short:

- **No HDL in a design and simulation project's messages.** The console no longer names the HDL files its drawings
  make; a drawing with errors says its module is not made again; Check Design's errors are on the drawing; Find in
  Project, Commit, Save as Test Bench, Verify and the Test Bench Wizard name no HDL file.

In detail:

- **A design and simulation project without HDL, part 4 (#3891):** in a design project, a drawing's HDL made again
  says nothing (no "x.vhd generated / updated from …" in the console nor the status bar); one with errors warns
  "x.fsm.json: its module is not made again: …" (web/js/design-only.js `hdlStatus`, `hdlWarning`); Check Design's
  diagnostics (the console, the Errors and Warnings tabs, the simulation's elaboration errors) are on the drawing with
  no line, by Silinx (`shownDiag`), its process named Check Design, "Checking top module"; a drawing whose HDL file
  name is taken is [Not made], Make Module…; Find in Project leaves out the HDL; Commit lists no HDL file; Pull's
  merged drawing says nothing of its HDL; Save as Test Bench, Verify's counterexample and the stimuli editor's tip name
  the test bench, not its file; "a design and simulation project now" without its HDL. The MCP server matches: the
  drawings' sync messages (core/drawing-sync.js), `check_syntax` (Check Design, the drawing, Silinx), `test_bench_wizard`
  and `verify` (the test bench's name, no `language`), `find_in_project` without the HDL.
