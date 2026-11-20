// The FSM Wizard's sequence detector (#2149; a regular expression, #4902): the input x read one bit at each clock
// edge, the output z 1 when the bits read end with a match of the pattern, a bit string (1011) or a regular expression
// over 0 and 1 (1(01)*1, core/regex-automata.js). Its automaton the textbook way: the expression's NFA (Thompson),
// the DFA of .*R (the subset construction, a match may start at any bit), then a Moore or a Mealy machine, minimised.
// Overlapping matches: the search goes on after a match (1011011: two matches of 1011); not overlapping: it starts
// again after the match's last bit (1011011: one). A bit string gives the diagram it always gave: the state Si has the
// first i bits of the pattern matched (the states numbered breadth-first from S0).
import { parseRegex, thompson, subsetDfa, minimize, languageOf, RegexError } from './regex-automata.js';

/** The most states a detector may have. */
const MAX_DETECTOR_STATES = 64;

// the automaton of a pattern (a RegexError if it is refused)
function automaton(pattern) {
  const nfa = thompson(parseRegex(pattern));
  const lang = languageOf(nfa);
  if (lang.empty) throw new RegexError('Pattern: it matches no bit string.');
  if (lang.nullable) throw new RegexError('Pattern: it matches the empty string (no bits), so z would always be 1: make every match at least one bit long.');
  return subsetDfa(nfa, { search: true });
}

/**
 * The machine of a detector: { next [[on 0, on 1]], out (Moore: [z of the state]; Mealy: [[z on 0, z on 1]]), start: 0 },
 * minimised, its states numbered breadth-first.
 */
export function detectorMachine(pattern, overlap, type) {
  const dfa = automaton(pattern);
  let next, label;
  if (type === 'moore') {
    // the accepting states (z = 1); not overlapping, they go on as the start does
    next = dfa.next.map((t, q) => (dfa.accept[q] && !overlap ? dfa.next[dfa.start] : t));
    label = dfa.accept.map(a => (a ? '1' : '0'));
  } else {
    // z = 1 on a move into an accepting state; not overlapping, the move goes back to the start instead
    next = dfa.next.map(t => t.map(d => (dfa.accept[d] && !overlap ? dfa.start : d)));
    label = dfa.next.map(t => t.map(d => (dfa.accept[d] ? '1' : '0')).join(''));
  }
  const m = minimize({ next, label, start: dfa.start });
  if (m.next.length > MAX_DETECTOR_STATES) throw new RegexError(`Pattern: its detector would have ${m.next.length} states, more than ${MAX_DETECTOR_STATES}.`);
  return { next: m.next, out: type === 'moore' ? m.label.map(Number) : m.label.map(l => [...l].map(Number)), start: 0 };
}

/** A pattern's error (`Pattern: …`) for a detector overlapping or not, Moore or Mealy, or null. */
export function patternError(pattern, overlap = true, type = 'moore') {
  try { detectorMachine(String(pattern ?? '').trim(), overlap, type); return null; } catch (e) {
    if (e instanceof RegexError) return e.message;
    throw e;
  }
}

/** The FSM template of a detector (core/chart-templates.js's fsmTemplate): ports x and z, the states S0, S1…, a circle. */
export function detectorTemplate(pattern, overlap, type) {
  const m = detectorMachine(pattern, overlap, type);
  const st = m.next.map((_, i) => `S${i}`);
  const transitions = [];
  st.forEach((s, i) => {
    for (const b of [1, 0]) {
      const z = type === 'mealy' && m.out[i][b];
      transitions.push({ from: s, to: st[m.next[i][b]], cond: b ? 'x' : '!x', ...(z ? { outputs: { z: '1' } } : {}) });
    }
  });
  const outputs = type === 'moore' ? Object.fromEntries(st.filter((_, i) => m.out[i]).map(s => [s, { z: '1' }])) : {};
  return { type, ports: [{ name: 'x', dir: 'in', width: 1 }, { name: 'z', dir: 'out', width: 1 }], states: st, outputs, transitions, layout: 'circle' };
}
