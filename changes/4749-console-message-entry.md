In short:

- A warning that carries a Trust Project button, or a message's "… failed:" line right after it, shows the button in
  the Errors / Warnings tabs too; each line of a simulation's message in the console opens its source when
  double-clicked, not only its last.

In detail:

- **The console's entries made from its messages (#4749, step 3):** a console line's message holds the tool that
  said it, its location (the project's file and line its text names, or its writer's own) and its action
  (`core/message.js`: `lineMessage`), and its entry of the Errors / Warnings tabs is made from it (`entryOf`): the
  console no longer reads the line's text again (`MESSAGE_LINE` read once, in core), and an entry's button is its
  message's action, not a refusal read back from its text. SSim's and the Board Emulator's lines hold their messages
  (their locations: the design's line that said them), which their copies in the console keep, each line of SSim's a
  link.
