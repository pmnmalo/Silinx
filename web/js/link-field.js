// A sharing window's link (#3995, #3996, #4073): made by Generate only, then hidden, a masked box as tall as its
// buttons; Copy copies it, shown or not; Show shows it (Hide hides it again); its QR code only when asked, Show QR Code,
// as large as the window allows (link-qr.js enlargeQr): no small QR code in the window. A link not made yet disables
// the three; one longer than a QR code holds disables Show QR Code, its reason its tip.
import { h } from './ui.js';
import { enlargeQr } from './link-qr.js';
import { qrSvg } from '/core/qr.js';

/** The field of a link: { el (the box, then its buttons Generate, Copy, Show, Show QR Code), set(link | null), link,
 *  generated }. `field` its data-field; `generate()` makes the link (#4073: a link exists only once Generate is
 *  clicked; it resolves to the link, or null: not made, said by the window); `onCopy(link)` copies it (and says so);
 *  `title` the QR code's window's. set(link) shows a link made (Generate then disabled); set(null) none, Generate on. */
export function linkField({ field = 'link', onCopy, generate, title = 'QR Code' } = {}) {
  let link = null, shown = false, busy = false;
  const input = h('input', { type: 'password', readonly: '', class: 'link-out', 'data-field': field, 'data-no-i18n': '', autocomplete: 'off', spellcheck: false });
  const make = h('button', { class: 'btn link-generate', type: 'button', onclick: async () => {
    if (busy || link) return;
    busy = true; draw();
    try { const l = await generate(); if (l) link = l; } finally { busy = false; }
    input.value = link || '';
    draw();
  } }, 'Generate');
  const copy = h('button', { class: 'btn link-copy', type: 'button', onclick: () => { if (link) onCopy(link); } }, 'Copy');
  const show = h('button', { class: 'btn link-show', type: 'button', onclick: () => { shown = !shown; draw(); } }, 'Show');
  const qrButton = h('button', { class: 'btn link-qr', type: 'button', onclick: () => { if (link) enlargeQr(link, title); } }, 'Show QR Code');
  const draw = () => {
    input.type = shown && link ? 'text' : 'password';
    show.textContent = shown && link ? 'Hide' : 'Show';
    make.disabled = busy || !!link;
    for (const b of [show, copy]) b.disabled = !link;
    const fits = !!link && !!qrSvg(link);
    qrButton.disabled = !fits;
    qrButton.title = link && !fits ? `The link is ${link.length} characters, too long for a QR code` : '';
  };
  draw();
  return {
    el: h('div', { class: 'link-field' }, input, h('div', { class: 'link-buttons' }, make, copy, show, qrButton)),
    get link() { return link; },
    set(l) { link = l || null; input.value = link || ''; draw(); },
  };
}
