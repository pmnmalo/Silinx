// A sharing window's link (#3995, #3996): hidden at first, a masked field; Show shows it (Hide hides it again), Copy
// copies it, shown or not; its QR code only when asked, Show QR Code, as large as the window allows (link-qr.js
// enlargeQr): no small QR code in the window. A link not made yet (a short link before Generate) disables the three; one
// longer than a QR code holds disables Show QR Code, its reason its tip.
import { h } from './ui.js';
import { enlargeQr } from './link-qr.js';
import { qrSvg } from '/core/qr.js';

/** The field of a link: { el (the field, then its buttons Show and Copy), qrButton (Show QR Code, placed by the
 *  window), extra (where the window adds a button of its own, before Show QR Code), set(link | null), link }.
 *  `field` its data-field; `onCopy(link)` copies it (and says so); `title` the QR code's window's. */
export function linkField({ field = 'link', onCopy, title = 'QR Code' } = {}) {
  let link = null, shown = false;
  const input = h('input', { type: 'password', readonly: '', class: 'link-out', 'data-field': field, 'data-no-i18n': '', autocomplete: 'off', spellcheck: false });
  const show = h('button', { class: 'btn link-show', type: 'button', onclick: () => { shown = !shown; draw(); } }, 'Show');
  const copy = h('button', { class: 'btn link-copy', type: 'button', onclick: () => { if (link) onCopy(link); } }, 'Copy');
  const qrButton = h('button', { class: 'btn link-qr', type: 'button', onclick: () => { if (link) enlargeQr(link, title); } }, 'Show QR Code');
  const extra = h('div', { class: 'link-extra' });
  const draw = () => {
    input.type = shown && link ? 'text' : 'password';
    show.textContent = shown && link ? 'Hide' : 'Show';
    for (const b of [show, copy]) b.disabled = !link;
    const fits = !!link && !!qrSvg(link);
    qrButton.disabled = !fits;
    qrButton.title = link && !fits ? `The link is ${link.length} characters, too long for a QR code` : '';
  };
  draw();
  return {
    el: h('div', { class: 'link-field' }, input, h('div', { class: 'link-buttons' }, show, copy, extra, qrButton)),
    qrButton, extra,
    get link() { return link; },
    set(l) { link = l || null; input.value = link || ''; draw(); },
  };
}
