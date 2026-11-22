In short:

- **The simulation's lines in Portuguese:** the Test Bench Wizard's line, Set as Top Module's, and the simulator's own
  (the wave configuration saved and loaded, a force removed, a run interrupted or stopped, Step, the stimuli's
  checks, the VCD export) in the interface's language, in the simulator's console and in the Console.

In detail:

- **The simulation's application lines translated (#5223):** SSim's console (`web/js/isim-console.js`) takes an
  application's line (`logLine(text, kind, { app: true })`: `isim-wcfg.js`, `isim-run.js`, `isim-forces.js`,
  `isim-stimuli.js`, `isim-api.js`, `isim-toolbar.js`) and draws it through `t()`, its tag kept, again when the
  language changes; its message keeps its English, and the Console's copy of it (`web/js/messages.js`) is drawn the
  same way. The Test Bench Wizard's line and Set as Top Module's are application lines of the Console (`appLog`). Their
  Portuguese in `web/js/i18n-sim.js`. The simulator's output (the design's reports, the commands' answers, its banner)
  stays as it is; the MCP server's messages stay in English.
