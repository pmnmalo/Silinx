// The simulations a shared project's owner has open, as its followers follow them (#4002, part 3; core/collab-activity.js):
// the channel `sim`, by SSim document (`isim:<module>[@model]`): the time it has reached, its drawn stimuli (a key of
// them), its forces and its wave view (the signals shown, their radix and groups, the cursor, the markers, the zoom, the
// run time, the instance shown). A follower's page runs its own simulation of the same files to the same time (the
// same waves: the simulator is deterministic) and shows the same view. Each value as the owner makes it and as a
// follower takes it (untrusted input: what is not one left out).

/** The limits: the documents, the rows of one, the markers, the forces, the time (ps: 1 s). */
export const SIM_LIMITS = Object.freeze({ docs: 8, rows: 2000, markers: 64, forces: 64, now: 1e12 });
const DOC_RE = /^isim:[A-Za-z_][\w$]{0,127}(?:@\w{1,32})?$/;
const PATH_RE = /^[\w$.()[\]\\-]{1,512}$/;
const num = (x, lo = 0, hi = Number.MAX_SAFE_INTEGER) => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);
const str = (x, max = 200) => (typeof x === 'string' && x.length <= max ? x : null);

/** A simulation's state as its follower gets it, from SSim's getState() (its panels' sizes left out: the follower's
 *  own) and its time: { now, stim, forces, view: { rows, cursor, markers, t0, scale, fit, curInst, runTime } }. */
export function simDocActivity(state, now, stim = null) {
  const { forces = [], nameW, valW, leftW, consoleH, ...view } = state || {};   // eslint-disable-line no-unused-vars
  return { now: num(now) ?? 0, stim: str(stim, 64), forces, view };
}

/** The `sim` value: { docs: { id: simDocActivity } }, the first SIM_LIMITS.docs SSim documents. */
export function simActivity(docs, limits = SIM_LIMITS) {
  const out = {};
  for (const [id, v] of docs) if (DOC_RE.test(id) && Object.keys(out).length < limits.docs) out[id] = v;
  return { docs: out };
}

function row(r) {
  if (!r || typeof r !== 'object') return null;
  const group = Number.isSafeInteger(r.group) && r.group >= 0 ? { group: r.group } : {};
  if (r.kind === 'div' && str(r.name)) return { kind: 'div', name: r.name, ...group };
  if (r.kind === 'group' && str(r.name)) return { kind: 'group', name: r.name, expanded: r.expanded !== false, ...group };
  if (r.kind === 'sig' && typeof r.path === 'string' && PATH_RE.test(r.path)) return { kind: 'sig', path: r.path, radix: str(r.radix, 16) || 'default', expanded: !!r.expanded, ...group };
  return null;
}
function force(f) {
  if (!f || typeof f.path !== 'string' || !PATH_RE.test(f.path) || !Array.isArray(f.pattern) || num(f.start) === null) return null;
  const pattern = f.pattern.slice(0, 64).filter(p => num(p?.off) !== null && typeof p.bits === 'string' && /^[01xzuwlh-]{1,1024}$/i.test(p.bits)).map(p => ({ off: p.off, bits: p.bits }));
  if (!pattern.length) return null;
  return { path: f.path, start: f.start, repeat: num(f.repeat), end: num(f.end), endRelease: f.endRelease !== false, desc: str(f.desc) || '', pattern };
}

/** A `sim` value as a follower takes it (untrusted): { docs: { id: { now, stim, forces, view } } }; null: not one. */
export function followedSim(v, limits = SIM_LIMITS) {
  if (!v || typeof v !== 'object' || !v.docs || typeof v.docs !== 'object' || Array.isArray(v.docs)) return null;
  const docs = {};
  for (const [id, d] of Object.entries(v.docs).slice(0, limits.docs)) {
    if (!DOC_RE.test(id) || !d || typeof d !== 'object') continue;
    const w = d.view && typeof d.view === 'object' ? d.view : {};
    const view = {
      rows: Array.isArray(w.rows) ? w.rows.slice(0, limits.rows).map(row).filter(Boolean) : [],
      cursor: num(w.cursor) ?? 0, markers: Array.isArray(w.markers) ? w.markers.slice(0, limits.markers).filter(t => num(t) !== null) : [],
      t0: num(w.t0) ?? 0, scale: num(w.scale, 1e-9) ?? 1000, fit: w.fit === true, curInst: str(w.curInst, 512),
      ...(w.runTime && str(w.runTime.value, 32) !== null && str(w.runTime.unit, 4) !== null ? { runTime: { value: w.runTime.value, unit: w.runTime.unit } } : {}),
    };
    docs[id] = { now: num(d.now, 0, limits.now) ?? 0, stim: str(d.stim, 64), forces: Array.isArray(d.forces) ? d.forces.slice(0, limits.forces).map(force).filter(Boolean) : [], view };
  }
  return { docs };
}

/** A short key of a simulation's drawn stimuli (their change: the follower's simulation run again with them). */
export function stimKey(model) {
  if (!model) return null;
  const s = JSON.stringify(model);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${s.length}.${h.toString(16)}`;
}

/** The simulations in words (the MCP's follow_project). */
export function simLines(v) {
  const s = followedSim(v);
  if (!s) return [];
  const ns = ps => `${+(ps / 1000).toFixed(3)} ns`;
  return Object.entries(s.docs).map(([id, d]) => `Their simulation ${id.slice(5)}: run to ${ns(d.now)}, the cursor at ${ns(d.view.cursor)}, ${d.view.rows.filter(r => r.kind === 'sig').length} signal(s) shown${d.forces.length ? `, ${d.forces.length} force(s)` : ''}.`);
}
