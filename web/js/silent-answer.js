// An answer awaited with a deadline for saying it has not come (#4694): the browser's answer for a remembered workspace
// folder (web/js/storage-late.js), which Chrome may not give at all while it is stuck on that folder.

/** Resolve as `asked` does; if it has not settled after `ms`, call `silent()` once first (the wait goes on). */
export function onSilence(asked, ms, silent) {
  let done = false;
  const timer = setTimeout(() => { if (!done) silent(); }, ms);
  const end = () => { done = true; clearTimeout(timer); };
  return Promise.resolve(asked).then(v => { end(); return v; }, e => { end(); throw e; });
}
