In short:

- **The menus, dialogs, tabs and Design tree work with the keyboard and a screen reader:** F10 or Alt takes the menu
  bar, the arrows go through the menus, Esc goes back; a dialog keeps Tab inside it and gives the focus back when it
  closes; an Undo toast stays while it has the focus.

In detail:

- **Accessibility of the menu bar, the menus, the dialogs, the document tabs, the Design tree and the messages
  (#4761):** the menu bar is a `menubar` (its menus `menuitem`s, F10 or Alt alone takes it, ← → between its menus, Enter,
  Space or ↓ opens one, Esc back where the focus was, and a command acts there: Edit ▸ Copy on the field); a menu is a
  `menu` (its entries `menuitem`s or `menuitemcheckbox`es, ↑ ↓ Home End, → and ← into and out of a submenu, ↓ into a
  context menu, Esc closes it). A dialog is a modal `dialog` named by its title; Tab and Shift+Tab stay in it, the app's
  shortcuts do not reach the document behind it (Ctrl+P printed it), and the focus goes back where it was when it
  closes. The document tabs are a `tablist` of `tab`s (`aria-selected`), the Design tree and the Libraries a `tree`
  (`treeitem`s, `aria-expanded`, the selected row its `aria-activedescendant`); the console is a polite live `log`, the
  toasts a live `status` (an error an `alert`), a toast kept while the pointer is over it or its button has the focus.
