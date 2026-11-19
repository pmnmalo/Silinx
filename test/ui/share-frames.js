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
