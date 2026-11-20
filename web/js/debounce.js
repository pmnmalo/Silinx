// Silinx - a call made once a moment after the last of a burst (#4772: the editors' and dialogs' timers, one copy): a
// reading after the last stroke, a refresh after the last change. No DOM.
//
//   const later = debounce(fn, ms)
//   later(...args)    fn(...args) in ms, unless later is called again first (then ms from that call)
//   later.cancel()    the call pending dropped          later.flush()   the call pending made now (with no arguments)
//   later.pending()   whether a call is pending

/** fn called ms after the last of a burst of calls (see above). */
export function debounce(fn, ms) {
  let timer = null;
  const later = (...args) => { clearTimeout(timer); timer = setTimeout(() => { timer = null; fn(...args); }, ms); };
  later.cancel = () => { clearTimeout(timer); timer = null; };
  later.flush = () => { if (timer !== null) { later.cancel(); fn(); } };
  later.pending = () => timer !== null;
  return later;
}
