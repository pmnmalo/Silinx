// A read-only document's side panel (#5736): its text fields read only, so that their text is still selected and
// copied (Ctrl+C, Edit ▸ Copy), as the schematic's Properties do; its other fields (choices, tick boxes, buttons) disabled.

const TEXT = /^(text|number|search|url|email|)$/i;
/** Whether el is a field whose text is typed: a text area or a text-like input. */
const isTextField = el => el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT.test(el.getAttribute('type') || ''));

/** The fields locked: the text ones read only, the others disabled (or, `hideButtons`, the buttons hidden). */
export function lockFields(els, { hideButtons = false } = {}) {
  for (const x of els) {
    if (isTextField(x)) x.readOnly = true;
    else if (hideButtons && x.tagName === 'BUTTON') x.hidden = true;
    else x.disabled = true;
  }
}
