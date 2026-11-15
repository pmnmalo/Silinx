// How a circuit's wires are drawn (#4064, docs/CIRCUITS.md): straight between their bends, or (Curved wires, the circuit's
// wireStyle 'curved') a smooth curve through them, as a jumper wire bends (a Catmull-Rom spline, as cubic Béziers); with
// Hop-overs, a small arc where a wire crosses one drawn before it without joining it (never at an end: a wire's end on
// another's point is no crossing). The look only: the connections are the same (core/circuit-net.js). Points are
// pixels [x, y]. Isomorphic module, no imports.

const SAMPLES = 10;   // a curve's segments sampled into this many straight pieces (its crossings, its hops)

// the Bézier control points of the segment i of a Catmull-Rom spline through pts
function bezier(pts, i) {
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  return [p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2];
}

/** The SVG path of a smooth curve through the points pts (two points: a straight line). */
export function curveD(pts) {
  if (pts.length < 3) return `M${pts.map(([x, y]) => `${x},${y}`).join(' L')}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i + 1 < pts.length; i++) { const [, a, b, c] = bezier(pts, i); d += ` C${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]}`; }
  return d;
}

/** The curve through pts as a polyline (each segment in SAMPLES pieces): its crossings and hops are found on it. */
export function curvePoints(pts) {
  if (pts.length < 3) return pts.map((p) => [...p]);
  const out = [[...pts[0]]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p, a, b, c] = bezier(pts, i);
    for (let k = 1; k <= SAMPLES; k++) {
      const t = k / SAMPLES, u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      out.push([0, 1].map((j) => w[0] * p[j] + w[1] * a[j] + w[2] * b[j] + w[3] * c[j]));
    }
  }
  return out;
}

// where the segments ab and cd cross, strictly inside both (their ends left out by eps): { t (along ab), x, y } or null
function cross(a, b, c, d, eps = 1e-6) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;   // (parallel: no crossing)
  const q = [c[0] - a[0], c[1] - a[1]];
  const t = (q[0] * s[1] - q[1] * s[0]) / den, u = (q[0] * r[1] - q[1] * r[0]) / den;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { t, x: a[0] + t * r[0], y: a[1] + t * r[1] };
}

/**
 * The hops of the wires `lines` ([{ id, pts }], in drawing order, pts their polylines): Map(id → [{ seg, t, x, y }]),
 * each where the wire crosses one before it. Two wires that touch at an end, or share a point, do not hop.
 */
export function wireHops(lines) {
  const hops = new Map();
  lines.forEach((w, k) => {
    for (let i = 0; i + 1 < w.pts.length; i++) {
      for (const o of lines.slice(0, k)) {
        for (let j = 0; j + 1 < o.pts.length; j++) {
          const c = cross(w.pts[i], w.pts[i + 1], o.pts[j], o.pts[j + 1]);
          if (!c) continue;
          if (!hops.has(w.id)) hops.set(w.id, []);
          hops.get(w.id).push({ seg: i, ...c });
        }
      }
    }
  });
  return hops;
}

/** The SVG path of the polyline pts with its hops (wireHops's), each an arc of radius r over the crossing. */
export function hopD(pts, hops = [], r = 5) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = len ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [0, 0];
    let last = 0;   // (how far along the segment the path is)
    for (const h of hops.filter((x) => x.seg === i).sort((x, y) => x.t - y.t)) {
      const at = h.t * len;
      if (at - r < last || at + r > len) continue;   // (no room for its arc: after the previous one, within the segment)
      d += ` L${a[0] + u[0] * (at - r)},${a[1] + u[1] * (at - r)} A${r},${r} 0 0 1 ${a[0] + u[0] * (at + r)},${a[1] + u[1] * (at + r)}`;
      last = at + r;
    }
    d += ` L${b[0]},${b[1]}`;
  }
  return d;
}

/** Each wire's path (pixels): { id → d } of the wires [{ id, pts }], curved and with hops as asked. */
export function wirePaths(wires, { curved = false, hops = false, r = 5 } = {}) {
  const lines = wires.map((w) => ({ id: w.id, pts: curved ? curvePoints(w.pts) : w.pts }));
  const at = hops ? wireHops(lines) : new Map();
  return Object.fromEntries(lines.map((w, k) => [w.id, at.has(w.id) ? hopD(w.pts, at.get(w.id), r) : curved ? curveD(wires[k].pts) : hopD(w.pts, [], r)]));
}
