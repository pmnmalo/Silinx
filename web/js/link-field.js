// A sharing window's link (#3995, #3996, #4073): made by Generate only, then hidden, a masked box as tall as its
// buttons; Copy copies it, shown or not; Show shows it whole, wrapped over as many lines as it takes (#4190: a box of
// its own, read only, in place of the masked one; Hide hides it again, the masked box back); its QR code only when asked, Show QR Code,
// as large as the window allows (link-qr.js enlargeQr): no small QR code in the window. A link not made yet disables
// the three; one longer than a QR code holds disables Show QR Code, its reason its tip. A row field (#4576, Share
// Project… ▸ Live's two links): its buttons in one row below its box (wrapping on a narrow screen), Generate named for
// its link (Generate View-Only, Generate Edit); its box as tall as the link needs, the whole link in view, hidden (a dot
// for each of its characters, wrapped as it is) or shown; before Generate, as tall as the link it will make
// (`expected()`: its length).
import { h } from './ui.js';
import { enlargeQr } from './link-qr.js';
import { qrSvg } from '/core/qr.js';

/** The field of a link: { el (the box, then its buttons Generate, Copy, Show, Show QR Code), set(link | null), link,
 *  generated }. `label` Generate's label; `row`: its buttons in a row below a box as tall as the link (`expected()`, the
 *  length of the link Generate will make, the box's before). `field` its data-field; `generate()` makes the link (#4073: a link exists only once Generate is
 *  clicked; it resolves to the link, or null: not made, said by the window); `onCopy(link)` copies it (and says so);
 *  `title` the QR code's window's. set(link) shows a link made (Generate then disabled); set(null) none, Generate on. */
export function linkField({ field = 'link', onCopy, generate, title = 'QR Code', label = 'Generate', row = false, expected = () => 0 } = {}) {
  let link = null, shown = false, busy = false;
  const input = h('input', { type: 'password', readonly: '', class: 'link-out', 'data-field': field, 'data-no-i18n': '', autocomplete: 'off', spellcheck: false });
  const full = h('textarea', { class: 'link-full', readonly: '', rows: 1, 'data-no-i18n': '', autocomplete: 'off', spellcheck: false, hidden: true });
  // (a row field's box: always the textarea, the link's characters as dots while hidden; the masked input kept hidden,
  // its value the link's)
  const boxText = () => (!link ? '' : shown ? link : '•'.repeat(link.length));
  // shown: at least as tall as its text, wrapped at the window's width (measured unstretched; again when the width
  // changes: a narrow screen turned), and as its buttons, as the row stretches it
  const fit = () => {
    if (full.hidden) return;
    if (row) {
      // (as tall as its text, or, before Generate, as the link's it will make: measured with as many characters)
      const n = link ? 0 : Math.max(0, Number(expected()) || 0);
      if (n) full.value = 'x'.repeat(n);
      full.style.height = '0';
      full.style.height = `${full.scrollHeight + full.offsetHeight - full.clientHeight}px`;
      if (n) full.value = '';
      return;
    }
    Object.assign(full.style, { alignSelf: 'flex-start', minHeight: '0' });
    const h = full.scrollHeight + full.offsetHeight - full.clientHeight;
    Object.assign(full.style, { alignSelf: '', minHeight: `${h}px` });
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(full);
  const make = h('button', { class: 'btn link-generate', type: 'button', onclick: async () => {
    if (busy || link) return;
    busy = true; draw();
    try { const l = await generate(); if (l) link = l; } finally { busy = false; }
    input.value = link || '';
    full.value = row ? boxText() : link || '';
    draw();
  } }, label);
  const copy = h('button', { class: 'btn link-copy', type: 'button', onclick: () => { if (link) onCopy(link); } }, 'Copy');
  const show = h('button', { class: 'btn link-show', type: 'button', onclick: () => { shown = !shown; draw(); } }, 'Show');
  const qrButton = h('button', { class: 'btn link-qr', type: 'button', onclick: () => { if (link) enlargeQr(link, title); } }, 'Show QR Code');
  const draw = () => {
    input.type = shown && link ? 'text' : 'password';
    input.hidden = row || !!(shown && link);
    full.hidden = row ? false : !input.hidden;
    if (row) { full.value = boxText(); full.classList.toggle('link-masked', !!link && !shown); }
    fit();
    show.textContent = shown && link ? 'Hide' : 'Show';
    make.disabled = busy || !!link;
    for (const b of [show, copy]) b.disabled = !link;
    const fits = !!link && !!qrSvg(link);
    qrButton.disabled = !fits;
    qrButton.title = link && !fits ? `The link is ${link.length} characters, too long for a QR code` : '';
  };
  draw();
  return {
    el: h('div', { class: row ? 'link-field link-row' : 'link-field' }, input, full, h('div', { class: 'link-buttons' }, make, copy, show, qrButton)),
    get link() { return link; },
    set(l) { link = l || null; input.value = full.value = link || ''; draw(); },
    fit,
  };
}
