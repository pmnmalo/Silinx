// The Board Emulator's switches and buttons for a finger (#5121): on a phone the board is fitted to the screen's width
// (web/js/tasks-emu.js), its switches and buttons then too small to touch, so a strip under the board repeats them,
// large, in the board's order: each with the board's name of it (SW0, BTN1) and the design's bit it drives. A switch's
// tap toggles the board's switch, a button held holds the board's button down: the board's own parts do it (their
// press, their hold until the design saw it, #3109), and the strip follows them (on, off). Shown on a phone only
// (web/css/phone.css); a board with no switch nor button has none.

import { h } from './dom.js';

// a part's tip (a generic board's: its cell's), and its names from it ("SW0 = sw<0> (pin P11) — click to toggle", "BTN3:
// not connected in the UCF — …")
const tipOf = (el) => el.getAttribute('title') || el.closest('.emu-cell')?.getAttribute('title') || '';
function names(el) {
  const tip = tipOf(el).split(' — ')[0];
  const m = /^(.+?) = (\S+)/.exec(tip);
  return m ? { res: m[1], bit: m[2] } : { res: tip.replace(/:.*$/, ''), bit: null };
}

/** The strip of `main` (the emulator's board area), after its board; null when the board has no switch nor button. */
export function mountTouchControls(main) {
  const parts = [...main.querySelectorAll(':is(.emu-board-wrap, .emu-board) :is(.emu-sw, .emu-btn)')];
  if (!parts.length) return null;
  const strip = h('div', { class: 'emu-touch', role: 'group', 'aria-label': 'Switches and buttons' });
  for (const part of parts) {
    const sw = part.classList.contains('emu-sw'), { res, bit } = names(part);
    const b = h('button', { type: 'button', class: `emu-touch-${sw ? 'sw' : 'btn'}${bit ? '' : ' nc'}`, 'aria-pressed': 'false', title: tipOf(part) },
      h('span', { class: 'res', 'data-no-i18n': true }, res), h('span', { class: 'bit', 'data-no-i18n': true }, bit || '—'));
    if (sw) b.addEventListener('click', () => part.click());
    else {
      // (the finger's press and release to the board's button, which holds the pointer from then on)
      const fwd = (e) => part.dispatchEvent(new PointerEvent(e.type, { bubbles: true, cancelable: true, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, button: 0, buttons: e.type === 'pointerdown' ? 1 : 0 }));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); fwd(e); });
      for (const t of ['pointerup', 'pointercancel']) b.addEventListener(t, fwd);
    }
    const follow = () => { const on = part.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
    new MutationObserver(follow).observe(part, { attributes: true, attributeFilter: ['class'] });
    follow();
    strip.append(b);
  }
  strip.addEventListener('contextmenu', (e) => e.preventDefault());   // (a long press: no menu, as on the board, #1985)
  main.querySelector(':is(.emu-board-wrap, .emu-board)').after(strip);
  return strip;
}
