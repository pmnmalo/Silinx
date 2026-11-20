// Regular expressions over the bits 0 and 1, and their automata, the textbook way (#4902: the FSM Wizard's sequence
// detector, core/seq-detector.js): the expression parsed, its NFA by Thompson's construction, a DFA by the subset
// construction, the machine minimised by Moore's partition refinement.
// The syntax: 0 and 1, . or [01] any bit ([0], [1] one, [] none), ( ) a group, | the alternatives, the repetitions
// * + ? {n} {n,} {n,m} (n, m up to 16): JavaScript's own, so that RegExp is the tests' reference.

export const MAX_REPEAT = 16;
const MAX_TEXT = 64, MAX_NFA = 2000, MAX_DFA = 4096;

/** An expression's error: its message, `Pattern: …` as the wizard shows it. */
export class RegexError extends Error {}
const fail = msg => { throw new RegexError(`Pattern: ${msg}`); };
const at = (c, i) => `'${c}' at position ${i + 1}`;

/**
 * The expression `text` parsed: { t: 'sym', bits: [0?, 1?] } | { t: 'cat' | 'alt', a: [nodes] } |
 * { t: 'rep', e, min, max } (max Infinity: no limit). Throws a RegexError.
 */
export function parseRegex(text) {
  const s = String(text ?? '');
  if (!s) fail('a bit string (1011) or a regular expression over 0 and 1 (1(01)*1).');
  if (s.length > MAX_TEXT) fail(`at most ${MAX_TEXT} characters.`);
  let i = 0, depth = 0;
  const peek = () => s[i];
  const alt = () => {
    const a = [cat()];
    while (peek() === '|') { i++; a.push(cat()); }
    return a.length === 1 ? a[0] : { t: 'alt', a };
  };
  const cat = () => {
    const a = [];
    while (i < s.length && peek() !== '|' && peek() !== ')') a.push(repeat());
    if (!a.length && peek() === ')' && !depth) fail(`${at(')', i)} without its (.`);
    if (!a.length) fail(`an empty alternative before ${i < s.length ? at(s[i], i) : 'the end'}.`);
    return a.length === 1 ? a[0] : { t: 'cat', a };
  };
  const number = () => {
    const from = i;
    while (/[0-9]/.test(peek() ?? '')) i++;
    return from === i ? null : Number(s.slice(from, i));
  };
  const repeat = () => {
    let e = atom();
    for (;;) {
      const c = peek(), from = i;
      if (c === '*') { i++; e = { t: 'rep', e, min: 0, max: Infinity }; }
      else if (c === '+') { i++; e = { t: 'rep', e, min: 1, max: Infinity }; }
      else if (c === '?') { i++; e = { t: 'rep', e, min: 0, max: 1 }; }
      else if (c === '{') {
        i++;
        const min = number();
        let max = min;
        if (peek() === ',') { i++; max = number() ?? Infinity; }
        if (min === null || peek() !== '}' || min > MAX_REPEAT || (max !== Infinity && (max > MAX_REPEAT || max < min))) {
          fail(`${at('{', from)}: {n}, {n,} or {n,m}, whole numbers from 0 to ${MAX_REPEAT}, n ≤ m.`);
        }
        i++;
        e = { t: 'rep', e, min, max };
      } else return e;
    }
  };
  const atom = () => {
    const c = peek(), from = i;
    i++;
    if (c === '0' || c === '1') return { t: 'sym', bits: [c === '0', c === '1'] };
    if (c === '.') return { t: 'sym', bits: [true, true] };
    if (c === '[') {
      const bits = [false, false];
      while (peek() === '0' || peek() === '1') bits[+s[i++]] = true;
      if (peek() !== ']') fail(`${at('[', from)}: [ ] holds the bits it allows, 0, 1 or both, then ].`);
      i++;
      return { t: 'sym', bits };
    }
    if (c === '(') {
      if (i >= s.length) fail(`${at('(', from)} without its ).`);
      if (peek() === ')') fail(`${at('(', from)}: an empty group.`);
      depth++;
      const e = alt();
      if (peek() !== ')') fail(`${at('(', from)} without its ).`);
      depth--; i++;
      return e;
    }
    if (c === '*' || c === '+' || c === '?' || c === '{') fail(`nothing before ${at(c, from)} to repeat.`);
    if (c === ')') fail(`${at(')', from)} without its (.`);
    fail(`${at(c, from)}: not a bit (0, 1) nor one of . [ ] ( ) | * + ? { }.`);
  };
  const e = alt();
  if (i < s.length) fail(`${at(s[i], i)} without its (.`);
  return e;
}

/**
 * Thompson's NFA of an expression: { states: [{ eps: [to], sym: { bits, to } | null }], start, final }, one final
 * state, each state either ε-moves or one move on a bit.
 */
export function thompson(ast) {
  const states = [];
  const add = () => {
    if (states.length >= MAX_NFA) fail('too big: its automaton would have too many states.');
    states.push({ eps: [], sym: null });
    return states.length - 1;
  };
  const frag = n => {
    switch (n.t) {
      case 'sym': { const s = add(), f = add(); states[s].sym = { bits: n.bits, to: f }; return [s, f]; }
      case 'cat': {
        const parts = n.a.map(frag);
        for (let k = 1; k < parts.length; k++) states[parts[k - 1][1]].eps.push(parts[k][0]);
        return [parts[0][0], parts[parts.length - 1][1]];
      }
      case 'alt': {
        const s = add(), f = add();
        for (const [a, b] of n.a.map(frag)) { states[s].eps.push(a); states[b].eps.push(f); }
        return [s, f];
      }
      default: {   // rep: min copies, then the optional ones (or a star)
        const s = add();
        let end = s;
        const chain = ([a, b]) => { states[end].eps.push(a); end = b; };
        for (let k = 0; k < n.min; k++) chain(frag(n.e));
        if (n.max === Infinity) {
          const [a, b] = frag(n.e), f = add();
          states[end].eps.push(a, f);
          states[b].eps.push(a, f);
          end = f;
        } else {
          const f = add();
          for (let k = n.min; k < n.max; k++) { states[end].eps.push(f); chain(frag(n.e)); }
          states[end].eps.push(f);
          end = f;
        }
        return [s, end];
      }
    }
  };
  const [start, final] = frag(ast);
  return { states, start, final };
}

// the ε-closure of a set of NFA states: the sorted list
function closure(nfa, set) {
  const seen = new Set(set), todo = [...set];
  while (todo.length) for (const t of nfa.states[todo.pop()].eps) if (!seen.has(t)) { seen.add(t); todo.push(t); }
  return [...seen].sort((a, b) => a - b);
}

/**
 * The DFA of an NFA by the subset construction: { next: [[on 0, on 1]], accept: [bool], start: 0, sets }; a state is
 * the set of NFA states the bits read may have led to. search: the NFA's start state is added at every step, so the DFA
 * recognises .*R (a suffix of the bits matches; the overlapping detector's automaton). The empty set is a state too
 * (a dead state; never with search).
 */
export function subsetDfa(nfa, { search = false } = {}) {
  const startSet = closure(nfa, [nfa.start]);
  const sets = [], next = [], index = new Map();
  const state = set => {
    const key = set.join(',');
    if (!index.has(key)) {
      if (sets.length >= MAX_DFA) fail('too big: its automaton would have too many states.');
      index.set(key, sets.length); sets.push(set);
    }
    return index.get(key);
  };
  state(startSet);
  for (let d = 0; d < sets.length; d++) {
    next[d] = [0, 1].map(b => {
      const moved = sets[d].map(q => nfa.states[q].sym).filter(m => m && m.bits[b]).map(m => m.to);
      return state(closure(nfa, search ? [...moved, nfa.start] : moved));
    });
  }
  return { next, accept: sets.map(set => set.includes(nfa.final)), start: 0, sets };
}

/**
 * A machine minimised, by Moore's partition refinement: next [[on 0, on 1]], label [string] (what tells the states
 * apart at once: a Moore state's output, a Mealy state's outputs on 0 and on 1), start. Only the states reachable from
 * the start are kept. Returns { next, label, start: 0, classOf [old state -> new, -1 unreachable] }, the states
 * numbered breadth-first from the start, each state's move on 1 before its move on 0 (a sequence's prefixes in order).
 */
export function minimize({ next, label, start }) {
  // the reachable states
  const reach = [start], seen = new Set(reach);
  for (let k = 0; k < reach.length; k++) for (const t of next[reach[k]]) if (!seen.has(t)) { seen.add(t); reach.push(t); }
  // the blocks: first by label, then by the blocks of the next states, until no block splits
  let block = new Map();
  const number = keyOf => {
    const ids = new Map(), out = new Map();
    for (const q of reach) { const k = keyOf(q); if (!ids.has(k)) ids.set(k, ids.size); out.set(q, ids.get(k)); }
    return [out, ids.size];
  };
  let count;
  [block, count] = number(q => label[q]);
  for (;;) {
    const [b2, n2] = number(q => `${block.get(q)}|${next[q].map(t => block.get(t)).join(',')}`);
    block = b2;
    if (n2 === count) break;
    count = n2;
  }
  // the blocks numbered breadth-first from the start's
  const order = new Map([[block.get(start), 0]]), rep = [start];
  for (let k = 0; k < rep.length; k++) {
    for (const b of [1, 0]) {
      const t = next[rep[k]][b], bt = block.get(t);
      if (!order.has(bt)) { order.set(bt, order.size); rep.push(t); }
    }
  }
  return {
    next: rep.map(q => next[q].map(t => order.get(block.get(t)))),
    label: rep.map(q => label[q]),
    start: 0,
    classOf: next.map((_, q) => (seen.has(q) ? order.get(block.get(q)) : -1)),
  };
}

/** The language of an expression: { empty (no bit string), nullable (the empty string in it) }. */
export function languageOf(nfa) {
  const dfa = subsetDfa(nfa);
  return { empty: !dfa.accept.some(Boolean), nullable: dfa.accept[dfa.start] };
}
