// A small modified-nodal-analysis solver (#5382, the analog and digital roadmap #5387): a circuit's node voltages, DC
// (its operating point, the capacitors open) and in time (each capacitor its companion model: backward Euler on the
// first step after a change, trapezoidal after it), its diodes solved by Newton's method (their junction's voltage
// limited between iterations, as SPICE's pnjlim). The elements: resistors, capacitors, ideal voltage sources (a branch
// current each, MNA's extra rows), voltage sources with an output resistance (their Norton equivalent), current
// sources and diodes (Shockley's equation). Node -1 is the ground, 0 V; the others 0…n-1. Dense Gaussian elimination
// with partial pivoting: a breadboard's circuits have tens of nodes. Isomorphic module.

const GMIN = 1e-12;            // (S) from each node to the ground: a node joined to nothing still has a voltage
const VT = 0.025852;           // (V) the thermal voltage, kT/q at 300 K
const MAX_NEWTON = 100;

/**
 * A circuit's solver: n nodes, `elements` [{ kind, a, b, … }] (a: its + / anode, b: its − / cathode):
 *  R { ohms }, C { farads }, V { volts } (ideal), VR { volts, ohms } (a source with its output resistance; ohms
 *  Infinity: off), I { amps } (from a through the source to b), D { is, n } (Shockley: is (A), n its emission
 *  coefficient). The elements' values may change between solves (a potentiometer turned, a source's level).
 * Returns { dc(), step(dt), v, voltage(node), current(element), reset() }.
 */
export function createMna(n, elements) {
  const vs = elements.filter((e) => e.kind === 'V');
  const size = n + vs.length;
  const branch = new Map(vs.map((e, k) => [e, n + k]));
  let v = new Float64Array(size);         // the solution: node voltages, then the ideal sources' currents
  let fresh = true;                       // (the next time step after a dc() or a change: backward Euler)
  for (const e of elements) if (e.kind === 'C') { e.vc ??= 0; e.ic ??= 0; }
  for (const e of elements) if (e.kind === 'D') e.vd ??= 0;

  const at = (x, node) => (node < 0 ? 0 : x[node]);
  // one linear system, its matrix and right-hand side stamped from the elements at the diodes' current guesses
  function solveLinear(dt, trap, x) {
    const A = Array.from({ length: size }, () => new Float64Array(size)), z = new Float64Array(size);
    const g = (a, b, G) => { if (a >= 0) A[a][a] += G; if (b >= 0) A[b][b] += G; if (a >= 0 && b >= 0) { A[a][b] -= G; A[b][a] -= G; } };
    const src = (a, b, I) => { if (a >= 0) z[a] -= I; if (b >= 0) z[b] += I; };   // (a current I from a to b through it)
    for (let i = 0; i < n; i++) A[i][i] += GMIN;
    for (const e of elements) {
      switch (e.kind) {
        case 'R': g(e.a, e.b, 1 / Math.max(e.ohms, 1e-9)); break;
        case 'VR': if (Number.isFinite(e.ohms)) { const G = 1 / Math.max(e.ohms, 1e-9); g(e.a, e.b, G); src(e.a, e.b, -e.volts * G); } break;
        case 'I': src(e.a, e.b, e.amps); break;
        case 'C': {
          if (!dt) break;                     // (DC: open)
          const G = (trap ? 2 : 1) * e.farads / dt;
          g(e.a, e.b, G);
          src(e.a, e.b, -(G * e.vc + (trap ? e.ic : 0)));
          break;
        }
        case 'D': {
          const vd = e.vd, nvt = e.n * VT, ex = Math.exp(Math.min(vd / nvt, 80));
          const id = e.is * (ex - 1), G = e.is * ex / nvt + GMIN;
          g(e.a, e.b, G);
          src(e.a, e.b, id - G * vd);
          break;
        }
        case 'V': {
          const k = branch.get(e);
          if (e.a >= 0) { A[e.a][k] += 1; A[k][e.a] += 1; }
          if (e.b >= 0) { A[e.b][k] -= 1; A[k][e.b] -= 1; }
          z[k] = e.volts;
          break;
        }
        default: throw new Error(`no analog element '${e.kind}'`);
      }
    }
    return gauss(A, z) ?? x;
  }
  // the system solved with the diodes' Newton iterations (their junction voltages limited)
  function solve(dt, trap) {
    const diodes = elements.filter((e) => e.kind === 'D');
    let x = v;
    for (let it = 0; it < MAX_NEWTON; it++) {
      x = solveLinear(dt, trap, x);
      if (!diodes.length) break;
      let done = true;
      for (const e of diodes) {
        const want = at(x, e.a) - at(x, e.b), vd = limit(want, e.vd, e.n * VT, e.is);
        if (Math.abs(vd - e.vd) > 1e-9 + 1e-6 * Math.abs(vd)) done = false;
        e.vd = vd;
      }
      if (done) break;
    }
    v = x;
  }
  const api = {
    /** the operating point: the capacitors open (their voltages then the nodes'), the time steps starting afresh */
    dc() {
      solve(0, false);
      for (const e of elements) if (e.kind === 'C') { e.vc = at(v, e.a) - at(v, e.b); e.ic = 0; }
      fresh = true;
      return api;
    },
    /** the circuit `dt` seconds later, its sources as they are now */
    step(dt) {
      const trap = !fresh;
      solve(dt, trap);
      for (const e of elements) {
        if (e.kind !== 'C') continue;
        const vc = at(v, e.a) - at(v, e.b), G = (trap ? 2 : 1) * e.farads / dt;
        e.ic = trap ? G * (vc - e.vc) - e.ic : G * (vc - e.vc);
        e.vc = vc;
      }
      fresh = false;
      return api;
    },
    /** the next step a fresh one (backward Euler): after a source's or a value's change, whose jump trapezoids ring on */
    changed() { fresh = true; },
    /** the capacitors' state solved at this instant, their voltages kept (a source changed: the nodes at once) */
    settle() {
      // (a capacitor is a voltage source for an instant: dt → 0 in its companion model; done as a step of 1 ps)
      solve(1e-12, false);
      fresh = true;
      return api;
    },
    voltage: (node) => at(v, node),
    /** an element's current (A), from its a to its b through it */
    current(e) {
      const vab = at(v, e.a) - at(v, e.b);
      switch (e.kind) {
        case 'R': return vab / Math.max(e.ohms, 1e-9);
        case 'VR': return Number.isFinite(e.ohms) ? (vab - e.volts) / Math.max(e.ohms, 1e-9) : 0;
        case 'I': return e.amps;
        case 'C': return e.ic;
        case 'D': return e.is * (Math.exp(Math.min(vab / (e.n * VT), 80)) - 1);
        case 'V': return v[branch.get(e)];
        default: return 0;
      }
    },
    /** back to time 0: the capacitors empty */
    reset() { for (const e of elements) { if (e.kind === 'C') { e.vc = 0; e.ic = 0; } if (e.kind === 'D') e.vd = 0; } v = new Float64Array(size); fresh = true; },
    get size() { return size; },
  };
  return api;
}

// a diode's junction voltage between Newton's iterations: a step up limited to a log's (SPICE's pnjlim), so that the
// exponential does not overflow
function limit(vnew, vold, nvt, is) {
  const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * is));
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nvt;
      return arg > 0 ? vold + nvt * Math.log(arg) : vcrit;
    }
    return nvt * Math.log(vnew / nvt);
  }
  return vnew;
}

/** A x = z solved by Gaussian elimination with partial pivoting (A and z overwritten); null when singular. */
export function gauss(A, z) {
  const N = z.length;
  for (let c = 0; c < N; c++) {
    let p = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; [z[p], z[c]] = [z[c], z[p]]; }
    const row = A[c], piv = row[c];
    for (let r = c + 1; r < N; r++) {
      const f = A[r][c] / piv;
      if (!f) continue;
      const rr = A[r];
      for (let k = c; k < N; k++) rr[k] -= f * row[k];
      z[r] -= f * z[c];
    }
  }
  const x = new Float64Array(N);
  for (let r = N - 1; r >= 0; r--) {
    let s = z[r];
    for (let k = r + 1; k < N; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}
