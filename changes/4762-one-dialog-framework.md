In short:

- **Every dialog behaves the same:** SSim's Force and stimuli dialogs, Symbol Info and the command palette now keep Tab
  inside, close with Esc one at a time, and give the focus back when they close, as the app's other dialogs.

In detail:

- **One dialog framework (#4762):** SSim's dialogs (Force Constant, Force Clock, Stimulus Timing, a stimulus' value),
  the schematic editor's Symbol Info and the command palette had their own overlay, keys and focus rules; they are now
  ui.js's `dialog()`, with its stack (the innermost alone answers Esc and Enter), its close-once guard (#490), its
  role, name and focus (#4761). `dialog()` takes a host (the element it is put over: SSim's window, the editor), no
  title bar (Symbol Info's own header), the overlay's own look (the palette's), a field to focus first
  (`data-autofocus`) and a button that leaves it open (SSim's Apply); a button's validation that is not async closes it
  at once. SSim's dialogs look like the app's (its own dialog styles removed) and no longer close on a press outside
  them, as no other dialog of the app does.
