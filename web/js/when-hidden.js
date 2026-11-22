// What a running Try it does while it is not seen (#719, #5276): the Board Emulator, the System Emulator, the
// state diagram's, the ASM chart's and the Petri net's Run, the schematic's and the circuit's clocks. Not seen: the
// page hidden (another browser tab, a minimised window) or its document tab not the active one (its element not
// shown). One setting for all of them, the Board Emulator's When hidden: 'pause' (the default: held, and on from
// where it was when seen again, in real time, with no backlog) or 'run' (it keeps running; the browser slows a hidden
// page's timers).
import { prefKey } from './prefs.js';

export const HIDDEN_KEY = prefKey('silinx.emulator.hidden');
// (the setting changed: every watcher looks again)
const PREF_EVENT = 'silinx:when-hidden';

/** The When hidden setting: 'pause' (the default) or 'run'. */
export const hiddenPref = () => { try { return localStorage.getItem(HIDDEN_KEY) === 'run' ? 'run' : 'pause'; } catch { return 'pause'; } };

/** Sets the When hidden setting ('pause' or 'run'), remembered, and tells every watcher. */
export function setHiddenPref(v) {
  try { localStorage.setItem(HIDDEN_KEY, v === 'run' ? 'run' : 'pause'); } catch { /* ignore */ }
  globalThis.dispatchEvent?.(new Event(PREF_EVENT));
}

/** Watches whether `el` is seen: { shown(): the page visible and el shown, held(): not seen with the setting Pause,
 * destroy() }; onChange() after each change (the page's visibility, el's, the setting). */
export function watchSeen(el, onChange = () => {}) {
  let inView = true, gone = false;
  const shown = () => !document.hidden && inView;
  const held = () => !shown() && hiddenPref() === 'pause';
  const changed = () => { if (!gone) onChange(); };
  const onStorage = (e) => { if (e.key === HIDDEN_KEY) changed(); };
  document.addEventListener('visibilitychange', changed);
  globalThis.addEventListener?.(PREF_EVENT, changed);
  globalThis.addEventListener?.('storage', onStorage);
  // (the document tab: its element is hidden while another tab is active)
  const io = typeof IntersectionObserver === 'function' && el
    ? new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; changed(); }) : null;
  io?.observe(el);
  return {
    shown, held,
    destroy() {
      gone = true; io?.disconnect();
      document.removeEventListener('visibilitychange', changed);
      globalThis.removeEventListener?.(PREF_EVENT, changed);
      globalThis.removeEventListener?.('storage', onStorage);
    }
  };
}

/** fn() every `ms` while `el` is seen (a setInterval), none while it is held; seen again, a fresh interval: its next
 * call `ms` later, the time it was held not caught up. { held(), stop() }. */
export function intervalWhileSeen(el, ms, fn) {
  let timer = 0, stopped = false;
  const sync = () => {
    if (stopped) return;
    if (seen.held()) { clearInterval(timer); timer = 0; } else if (!timer) timer = setInterval(fn, ms);
  };
  const seen = watchSeen(el, sync);
  sync();
  return { held: seen.held, stop() { stopped = true; clearInterval(timer); timer = 0; seen.destroy(); } };
}

/** cb(now) at the next frame: an animation frame while the page is visible, a short timer while it is hidden (an
 * animation frame never comes then: a Try it kept running hidden). Returns its cancel(). */
export function nextFrame(cb) {
  if (document.hidden) { const t = setTimeout(() => cb(performance.now()), 4); return () => clearTimeout(t); }
  const r = requestAnimationFrame(cb);
  return () => cancelAnimationFrame(r);
}
