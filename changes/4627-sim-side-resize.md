In short:

- **Simulate's side panel resized as the other tasks':** drag its right edge, with nothing simulated or a simulation
  open; its width is the one Design, Implement and Emulate show, and it is remembered.

In detail:

- **Simulate's side panel's width dragged (#4627):** a handle over its right edge (`web/js/tasks-sim-split.js`), the
  side panel's splitter's own (`ui.js` `splitter`, its limits and key now `LEFT_SPLIT`, which gained `size`, a `max`
  function and `onSize`): one width for every task (180–700 px, at most 45 % of the work area in Simulate, `xl.leftW`),
  remembered across a task switch and a reload, hidden when the panel is folded or the document maximized; SSim's
  Instances and Objects follow it (`isim.js`), SSim's own splitter not shown in the Tasks interface. The ISE style
  interface is unchanged. Test: `test/ui/tasks-side-resize.test.js`, every task's side panel.
