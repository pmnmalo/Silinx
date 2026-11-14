// The QR code of a sharing window's link (#3637): Share Project…'s copy (the full link, or the short one once made) and
// its live sharing (the viewers' and the editors' links), for a phone or another computer to scan off the teacher's
// screen. Made here (core/qr.js, no network), an image of its SVG (the CSP's img-src data:), shown only when asked (a
// link's Show QR Code, link-field.js, #3995), as large as the window allows, for a projector; no small one in the window.
import { h, dialog } from './ui.js';
import { qrSvg } from '/core/qr.js';

const image = (svg, cls) => h('img', { class: cls, alt: 'QR code of the link', 'aria-label': 'QR code of the link', src: `data:image/svg+xml,${encodeURIComponent(svg)}` });

/** The enlarged QR code of `link`, in a dialog of its own (over the one that shows it). */
export function enlargeQr(link, title = 'QR Code') {
  const svg = qrSvg(link);
  if (!svg) return null;
  return dialog({
    title, width: 'min(94vw, calc(94vh - 80px))', className: 'qr-dlg',
    body: h('div', { class: 'qr-large' }, image(svg, 'qr-large-img'), h('div', { class: 'qr-large-link', 'data-no-i18n': '' }, link)),
    buttons: [{ label: 'Close', primary: true, value: true }],
  });
}
