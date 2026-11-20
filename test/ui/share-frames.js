// Share Project…'s switch between its ways, frame by frame (#4676): each animation frame's windows recorded from the
// click until the other way's window has shown in 10 frames; checked: one window in every frame (never none, never
// two), the old way's then the new way's only, the same box, A copy's link box as tall from its first frame.
import assert from 'node:assert/strict';

/** The frames of a switch: the Share row's input `to` (its data-field) clicked; `until` the new way ('copy' | 'live'). */
export const framesOf = async (page, to, until) => {
  await page.eval((t) => {
    window.__frames = [];
    const tick = () => {
      const ovs = [...document.querySelectorAll('.dlg-overlay')];
      window.__frames.push(ovs.map((o) => {
        const r = o.querySelector('.dlg').getBoundingClientRect();
        return { way: o.querySelector('.collab-dlg') ? 'live' : 'copy', box: [r.left, r.top, r.width, r.height].map(Math.round).join(','), link: Math.round(o.querySelector('select[data-field=view]') ? o.querySelector('.link-full')?.getBoundingClientRect().height ?? -1 : 0) };
      }));
      if (window.__frames.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.querySelector(`.dlg-overlay input[data-field="${t}"]`).click();
  }, to);
  // (until the new way's window has shown in 10 frames)
  await page.waitFor((w) => window.__frames.filter((f) => f[0]?.way === w).length >= 10, [until], { what: `${until}'s window, 10 frames` });
  return page.eval(() => window.__frames);
};
/** The frames checked, from the way `from` to `to`. */
export const checkFrames = (frames, from, to, what) => {
  assert.deepEqual(frames.filter((f) => f.length !== 1).map((f) => f.length), [], `${what}: one window in every frame`);
  const ways = frames.map((f) => f[0].way), first = ways.indexOf(to);
  assert.deepEqual([...new Set(ways.slice(0, first))].filter((w) => w !== from), [], what);
  assert.deepEqual([...new Set(ways.slice(first))], [to], `${what}: the new way's window only, once shown`);
  assert.deepEqual([...new Set(frames.map((f) => f[0].box))].length, 1, `${what}: the same box`);
  if (to === 'copy') assert.deepEqual([...new Set(frames.slice(first).map((f) => f[0].link))].length, 1, `${what}: the link box as tall from the first frame`);
};

/** The top window's Share: row and the way's sentence (#4712): `first`, the row (and the sentence below it) the window's
 *  first; `way` and `text`, the sentence shown; `lines`, every way's sentence's lines as it wraps (laid out in one
 *  place, the others unseen: all as many lines as one another, #4676). */
export const shareAbout = (page) => page.eval(() => {
  const lines = (e) => { const cs = getComputedStyle(e); return Math.round((e.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)); };
  const dlg = [...document.querySelectorAll('.dlg-overlay')].pop(), head = dlg.querySelector('.share-head');
  const all = [...head.querySelectorAll('.share-about > p')], on = all.filter((p) => getComputedStyle(p).visibility !== 'hidden');
  return {
    // (the window's body: its content, whose first child the head is)
    first: head.parentElement.parentElement.classList.contains('dlg-body') && head.parentElement.firstElementChild === head
      && head.firstElementChild.classList.contains('share-how') && head.lastElementChild.classList.contains('share-about'),
    way: on.map((p) => p.dataset.way).join(), text: on.map((p) => p.textContent).join(),
    lines: Object.fromEntries(all.map((p) => [p.dataset.way, lines(p)])),
  };
});

/** Every way's sentence as many lines as the others (#4712), at the window's width now. */
export const sameLines = async (page, what) => {
  const { lines } = await shareAbout(page);
  assert.equal(new Set(Object.values(lines)).size, 1, `${what}: ${JSON.stringify(lines)}`);
};
