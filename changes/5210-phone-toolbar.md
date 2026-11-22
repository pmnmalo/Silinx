In short:

- **Phones:** the main toolbar keeps Open Project, Undo, Redo and Find, the other tools in its **More tools** (⋯) menu;
  menus take the whole width and dialogs the whole screen.

In detail:

- A phone's header, the second phase of #5121 (#5210): under 600 px the main toolbar keeps Open Project, Undo, Redo
  and Find in Project and gathers the others, in their order and enabled as their buttons, in the menu of a More tools
  button (⋯) at its end (`web/js/phone-toolbar.js`), the ISE style's processes' buttons too; the ISE style's menu bar
  fits the width, in Portuguese too. A menu is the whole width, its items 40 px tall, no taller than the screen below
  where it opened; a dialog is the whole screen, a wizard's steps a line above its page (`web/css/phone.css`). At
  600 px and more nothing changes. UI tests at 375 × 812 and 430 × 932 with touch, in both interfaces and in
  Portuguese (`test/ui/phone-toolbar.test.js`).
