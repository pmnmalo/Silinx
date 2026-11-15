// The Board Emulators a shared project's owner has open, in the page (#4002, part 4; core/collab-emu.js): the owner's
// page sends each emulator's switches and buttons, its power, running or paused, its clock's rate (at once when the
// owner presses or lets go of one: a short press is not missed); a follower's page, while it follows the owner, gives
// its own emulator of the same design (opened by the owner's view: web/js/collab-activity.js) the same power, inputs,
// rate and run, through the board's own controls (a switch clicked, a button kept pressed or let go, the clock's list).
import { S } from './app.js';
import { viewKeyOf } from './view-state.js';
import { emuActivity, followedEmu } from '/core/collab-emu.js';

const emulators = () => S.docs.filter(d => /^emulator:/.test(viewKeyOf(d) || '') && d.view?.inputElements);

/** The owner's `emu` value: its open emulators. */
export const emuNow = () => emuActivity(emulators().map(d => [viewKeyOf(d), { inputs: d.view.inputs, powered: d.view.powered, running: d.view.running, speed: d.view.speed }]));

/** Calls soon() when the owner presses or lets go of a board's switch or button (its activity sent at once). */
export function watchBoards(soon) {
  const fn = e => { if (e.target.closest?.('.emu .emu-sw, .emu .emu-btn')) setTimeout(soon, 0); };
  for (const t of ['pointerdown', 'pointerup', 'click']) document.addEventListener(t, fn, true);
  return () => { for (const t of ['pointerdown', 'pointerup', 'click']) document.removeEventListener(t, fn, true); };
}

/** The owner's emulators put on a follower's page (`get`: the session's activity), at each tick. */
export function followEmu(get) {
  const e = followedEmu(get('emu'));
  if (!e) return;
  for (const d of emulators()) {
    const o = e.docs[viewKeyOf(d)], api = d.view;
    if (!o) continue;
    if (o.powered !== api.powered) api.power(o.powered);
    if (!o.powered) continue;
    const sel = d.el?.querySelector('select.emu-speed');
    if (sel && String(api.speed) !== String(o.speed) && [...sel.options].some(x => x.value === String(o.speed))) { sel.value = String(o.speed); sel.dispatchEvent(new Event('change')); }
    api.inputElements().forEach((el, i) => {
      if (i >= o.inputs.length || el.classList.contains('on') === o.inputs[i]) return;
      // (a switch: clicked; a button: kept pressed, or let go, as Shift+click does)
      if (el.classList.contains('emu-sw')) el.click();
      else el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true }));
    });
    api.run(o.running);
  }
}
