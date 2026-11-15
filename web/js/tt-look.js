// A truth table's look in live sharing (#4192, #4193): the output in front and how its results are seen (the Karnaugh
// map's SOP or POS, Quine-McCluskey's, the map shown, Quine-McCluskey's steps shown), as the participant's view sends it
// with its selection (core/collab-select.js) and as a follower puts the followed participant's: only when it changed
// (the follower's own choices kept meanwhile), what is not one left out, the table unchanged.
const KINDS = ['sop', 'pos'];

/** get(): { out, groups, qm, map, steps, outputs } (the editor's now); set(s): the same, put on the editor. */
export function ttLook(get, set) {
  let key = null;
  return {
    /** Its selection as it is sent: { items: ['out:<output>'], look: { groups, qm, map, steps } }. */
    shared() {
      const s = get();
      return { items: [`out:${s.out}`], look: { groups: s.groups, qm: s.qm, map: s.map, steps: s.steps } };
    },
    /** The followed participant's look (and its items: the output in front) put, when it changed. */
    set(look, items) {
      const o = (items || []).find(x => typeof x === 'string' && x.startsWith('out:'))?.slice(4), k = JSON.stringify([look, o]);
      if (k === key || !look) return false;
      key = k;
      const s = { ...get() };
      if (o && s.outputs.includes(o)) s.out = o;
      if (KINDS.includes(look.groups)) s.groups = look.groups;
      if (KINDS.includes(look.qm)) s.qm = look.qm;
      if (typeof look.map === 'boolean') s.map = look.map;
      if (typeof look.steps === 'boolean') s.steps = look.steps;
      set(s);
      return true;
    },
  };
}
