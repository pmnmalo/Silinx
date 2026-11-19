// How soon a shared project's page says what it does (#4647): its cursor, its selection, its view and its activity
// (core/collab-client.js setView, publish), which the page reads from itself (web/js/collab-share.js and
// collab-follow.js track()). It looked every TRACK_MS only, and sent a view at most every 250 ms: a cursor moved reached
// a follower 300 ms later on average, 550 ms at worst. Now an event of the page's that may move them (a key, a click, a
// selection) has it look SOON_MS later (once for a burst of them), TRACK_MS staying for what no event says (a
// simulation running, a report written); a follower's view is sent at most every VIEW_MS, under the relay's rate of a
// follower's awareness (core/collab-room.js ROOM_LIMITS: 10 a second after a burst of 40), the owner's every
// OWNER_VIEW_MS (the room limits none of the owner's: its cursor keeps up with its typing, whose every key is a frame).
//   soon(fn, { ms, timer, clear }) -> { poke() (fn called ms later, once for the pokes meanwhile), cancel() }
//   trackOnEvents(target, poke) -> unwatch()
/** The page's look at itself, at the least: what no event of the page's says. */
export const TRACK_MS = 300;
/** After an event of the page's: a frame later (its effect done: the cursor moved, the selection made). */
export const SOON_MS = 16;
/** A follower's view (its cursor, its selection) sent at most this often: 8 a second, under the relay's 10. */
export const VIEW_MS = 125;
/** The owner's view sent at most this often. */
export const OWNER_VIEW_MS = 50;
/** The events of the page that may move its cursor, its selection or its view. */
export const TRACK_EVENTS = Object.freeze(['keydown', 'keyup', 'pointerdown', 'pointerup', 'selectionchange', 'input', 'change']);

/** `fn` called `ms` after a poke, once for every poke meanwhile. `timer` and `clear` (setTimeout's) for the tests. */
export function soon(fn, { ms = SOON_MS, timer = setTimeout, clear = clearTimeout } = {}) {
  let t = null;
  return {
    poke() {
      if (t !== null) return false;
      t = timer(() => { t = null; fn(); }, ms);
      t?.unref?.();
      return true;
    },
    cancel() { if (t !== null) clear(t); t = null; },
    pending: () => t !== null,
  };
}

/** `poke()` at each of TRACK_EVENTS on `target` (the page's document: in its capture, before any editor stops it). */
export function trackOnEvents(target, poke) {
  const fn = () => poke();
  for (const e of TRACK_EVENTS) target.addEventListener(e, fn, true);
  return () => { for (const e of TRACK_EVENTS) target.removeEventListener(e, fn, true); };
}
