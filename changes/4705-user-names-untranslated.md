In short:

- In Portuguese, a project named clock is shown as clock, not relógio: names you give (projects, files, ports, states)
  are never translated.

In detail:

- **User data is never translated (#4705):** the interface's translation changed every text equal to one of its labels,
  and some labels are words users also give their projects, files and ports (`clock`: relógio, `Counter`, `Top`,
  `Display`, `input`, `enable`…). The elements that show them are marked `data-no-i18n`: Open Project's names, the Start
  page's and File ▸ Recent Projects, Design Properties' Name, a file's tab, the Test Bench and Module Wizards' port
  lists, the FSM editor's states and registers, the Petri net simulation's places, a chip's pins, the logic analyzer's
  probes and the merge view's files. `test/web-i18n.test.js` lists the dictionary's words that can be such a name.
