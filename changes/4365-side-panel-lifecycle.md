In detail:

- **A closed editor's side panels let go of (#4365, #4366):** each side panel's handle (web/js/side-resize.js, #4316)
  listened to the narrow-screen media query with a listener of its own, never removed, which kept every closed
  editor and viewer alive (the implemented design, the ASM chart, the Board Emulator: 34 to 119 listeners and up to
  1000 nodes a time); one listener now serves every panel, each held weakly. The handle is placed in the frame after
  the panel is resized, not in the ResizeObserver's callback, where WebKit reported "ResizeObserver loop completed
  with undelivered notifications" as a page error.
