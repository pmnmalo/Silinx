// A drawing editor's tools (#3971): the select arrow first, then its add tools, one of them pressed at a time and kept
// until another one, the arrow or Escape is picked (the Petri net editor's, #3218, shared by the state diagram's and the
// ASM chart's). The pressed one: `.active` and aria-pressed; the canvas, while an add tool is on, its `adding` class (a
// crosshair).

/** Draws tool `t` pressed among `buttons` ({ select, …: button }), and `canvas` (if any) with class `adding` unless it is the arrow. */
export function pressTool(buttons, t, canvas, adding) {
  for (const [k, b] of Object.entries(buttons)) {
    b.classList.toggle('active', k === t);
    b.setAttribute('aria-pressed', String(k === t));
  }
  canvas?.classList.toggle(adding, t !== 'select');
}
