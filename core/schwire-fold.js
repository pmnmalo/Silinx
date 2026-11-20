// A schematic's wires drawn twice over (#4920): a wire that runs back over itself (a spike), or two wires that meet end to
// end and leave their meeting point the same way, the one lying on the other. Left by a drag: a segment of a wire
// dragged onto the wire it continues, a part or a junction dot moved back over a wire, a wire drawn back over the one it
// starts from. Each is drawn as a short dangling stub, though it leads nowhere and connects nothing. trimFoldBacks
// removes the doubled part, the connections as they were: called by normalizeDoc after every edit, so the editor, Undo
// and the MCP's tools clean the same way.
//
// Where the line is: only what is drawn twice is removed. A wire that ends in nothing on a stretch of its own (a wire
// the user left unconnected, Check Syntax's "dangling wire" or "connects only") stays as it is. A doubled part with
// something on it that would lose its connection (a pin, an I/O marker or another wire's end at its tip, or on it) stays
// too, and so does a doubled wire that goes on from a junction dot (trimming it would move the dot back, #3806).
import { symbolPins } from './schdoc-symbols.js';

const same = (p, q) => p.x === q.x && p.y === q.y;
const dir = (p, q) => ({ x: Math.sign(q.x - p.x), y: Math.sign(q.y - p.y) });
const len = (p, q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
// (p on the straight segment a-b, its ends included)
const onSeg = (p, a, b) => (a.x === b.x ? p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
  : a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x));
const straight = (p, q) => (p.x === q.x) !== (p.y === q.y);

/** Removes the doubled parts of doc's wires (doc changed; modules: normModules's). Returns how many were removed. */
export function trimFoldBacks(doc, modules = {}) {
  let pins = null;
  const pinPts = () => (pins ||= [...doc.symbols.flatMap(s => symbolPins(s, modules)), ...doc.ports]);
  let n = 0;
  for (let guard = 0; guard < 1000; guard++) {
    if (!(spikeOnce(doc, pinPts) || overlapOnce(doc, pinPts))) break;
    n++;
  }
  return n;
}

// anything else attached at q (a pin, an I/O marker, an end of a wire not in `own`)
const attachedAt = (doc, pinPts, q, own) => pinPts().some(p => same(p, q)) ||
  doc.wires.some(w => !own.includes(w) && (same(w.points[0], q) || same(w.points[w.points.length - 1], q)));
// anything attached on the part of a-b past a (b included, or not: withB false): pins, markers, other wires' ends
const past = (q, a, b, withB) => onSeg(q, a, b) && !same(q, a) && (withB || !same(q, b));
const attachedOn = (doc, pinPts, a, b, own, withB = true) => pinPts().some(p => past(p, a, b, withB)) ||
  doc.wires.some(w => !own.includes(w) && [w.points[0], w.points[w.points.length - 1]].some(p => past(p, a, b, withB)));
// the net names on a-b (b included, a not) moved to a
function moveLabels(doc, a, b) { for (const l of doc.labels) if (onSeg(l, a, b) && !same(l, a)) { l.x = a.x; l.y = a.y; } }
function setPoints(w, pts) { w.points = pts; delete w.curve; }   // (its own curve no longer fits it)

// a wire that turns back on itself at a bend: the bend removed
function spikeOnce(doc, pinPts) {
  for (const w of doc.wires) {
    const P = w.points;
    for (let k = 1; k + 1 < P.length; k++) {
      const a = P[k - 1], b = P[k], c = P[k + 1];
      if (!straight(a, b) || !straight(b, c)) continue;
      const u = dir(b, a), v = dir(b, c);
      if (u.x !== v.x || u.y !== v.y) continue;
      // the doubled part: from the nearer of a and c to the tip b
      const near = len(a, b) <= len(b, c) ? a : c;
      if (attachedOn(doc, pinPts, near, b, [w])) continue;
      moveLabels(doc, near, b);
      setPoints(w, unbend([...P.slice(0, k), ...P.slice(k + 1)], k - 1));
      return true;
    }
  }
  return false;
}
// (the point at i, and the one after it, removed when they are in the middle of a straight run)
function unbend(P, i) {
  const mid = j => j > 0 && j + 1 < P.length && ((P[j - 1].x === P[j].x && P[j].x === P[j + 1].x) || (P[j - 1].y === P[j].y && P[j].y === P[j + 1].y))
    && dir(P[j - 1], P[j]).x === dir(P[j], P[j + 1]).x && dir(P[j - 1], P[j]).y === dir(P[j], P[j + 1]).y;
  for (const j of [i + 1, i]) if (mid(j)) P.splice(j, 1);
  return P.filter((p, j) => !j || !same(p, P[j - 1]));
}

// two wires with an end at the same point p whose end segments leave p the same way: the shorter one's end segment
// (s, from p to q) lies on the longer one's (l); s's end moved to q, l's too (only those two meet at p), or s removed
// (a stub ending in nothing on a branch of a junction dot)
function overlapOnce(doc, pinPts) {
  const at = new Map();
  doc.wires.forEach(w => [0, w.points.length - 1].forEach(i => {
    const k = `${w.points[i].x},${w.points[i].y}`;
    if (!at.has(k)) at.set(k, []);
    at.get(k).push({ w, i });
  }));
  for (const list of at.values()) {
    if (list.length < 2) continue;
    // (each end with its points from p on)
    const ends = list.map(({ w, i }) => ({ w, P: i ? [...w.points].reverse() : w.points, rev: !!i }));
    for (let x = 0; x < ends.length; x++) {
      for (let y = 0; y < ends.length; y++) {
        const S = ends[x], L = ends[y];
        if (x === y || S.w === L.w) continue;
        const p = S.P[0], q = S.P[1];
        if (!straight(p, q) || !straight(L.P[0], L.P[1])) continue;
        const u = dir(p, q), v = dir(L.P[0], L.P[1]);
        if (u.x !== v.x || u.y !== v.y || len(p, q) > len(L.P[0], L.P[1])) continue;
        if (len(p, q) === len(L.P[0], L.P[1]) && x > y) continue;   // (the same length: the first one is s)
        // q a bend of s: nothing else may be there (it would be connected); on the doubled part, nothing either
        const qEnd = S.P.length === 2;
        const atQ = attachedAt(doc, pinPts, q, [S.w, L.w]);
        if ((!qEnd && atQ) || attachedOn(doc, pinPts, p, q, [S.w, L.w], false)) continue;
        const pass = list.length === 2 && !pinPts().some(e => same(e, p));
        // (at a junction dot, or a pin: only a stub ending in nothing there; a doubled wire that goes on stays, the dot
        // where it was put, #3806)
        if (!pass && !(qEnd && !atQ)) continue;
        // s: its end at q (no wire left when it was that segment alone)
        const sRest = S.P.slice(1);
        if (sRest.length < 2) doc.wires.splice(doc.wires.indexOf(S.w), 1);
        else setPoints(S.w, S.rev ? sRest.reverse() : sRest);
        if (pass) {
          // only the two met at p: l starts at q now, the net names on the doubled part with it
          moveLabels(doc, q, p);
          const lRest = same(q, L.P[1]) ? L.P.slice(1) : [q, ...L.P.slice(1)];
          if (lRest.length < 2) doc.wires.splice(doc.wires.indexOf(L.w), 1);
          else setPoints(L.w, L.rev ? lRest.reverse() : lRest);
        }
        return true;
      }
    }
  }
  return false;
}
