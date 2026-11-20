// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A state diagram's encoding of the user's (#4908): each state's code typed (state.code, binary digits), read by
// core/fsm.js (fsmEncoding: the codes; validateFsm: their problems) and set by the editor's Properties and the MCP's
// set_fsm_encoding (setStateCode: a code typed makes the encoding the user's, the other states keeping theirs). No
// import of core/fsm.js (no cycle): the encoding of the others is given.

/** The encoding of the user's. */
export const USER_ENCODING = 'user';
/** A state register's widest code (bits). */
export const MAX_CODE_BITS = 32;

/** A code as kept: its binary digits, the blanks and _ left out ('' when none). */
export const cleanCode = (text) => String(text ?? '').replace(/[\s_]/g, '');

/** The codes of the user's of the states ([{ id, name, code }]): their problems, Check's errors ([{ message, state }], the
 *  state the id of the one it is about, of the second one for two states). */
export function userCodeProblems(states) {
  const out = [];
  const ok = [];
  for (const s of states) {
    const c = cleanCode(s.code);
    const add = (message) => out.push({ message, state: s.id });
    if (!c) add(`State ${s.name || '?'} has no code: in the encoding of the user's each state has its own`);
    else if (!/^[01]+$/.test(c)) add(`State ${s.name || '?'}: its code '${s.code}' must be binary digits (0 and 1)`);
    else if (c.length > MAX_CODE_BITS) add(`State ${s.name || '?'}: its code has ${c.length} bits; a code has ${MAX_CODE_BITS} at most`);
    else ok.push({ id: s.id, name: s.name || '?', c });
  }
  const widths = [...new Set(ok.map((x) => x.c.length))];
  if (widths.length > 1) out.push({ message: `The states' codes must all have the same width: ${ok.map((x) => `${x.name} ${x.c.length} bit(s)`).join(', ')}` });
  else {
    const seen = new Map();
    for (const x of ok) {
      if (seen.has(x.c)) out.push({ message: `States ${seen.get(x.c)} and ${x.name} have the same code ${x.c}`, state: x.id });
      else seen.set(x.c, x.name);
    }
  }
  return out;
}

/** The states' codes in the encoding of the user's: [{ code: BigInt, width }] in their order (a code not valid: the
 *  state's index, as binary, Check saying why). */
export function userCodes(states) {
  const cs = states.map((s) => cleanCode(s.code));
  const width = Math.max(1, ...cs.filter((c) => /^[01]+$/.test(c)).map((c) => c.length), (states.length - 1).toString(2).length);
  return cs.map((c, i) => ({ code: /^[01]+$/.test(c) && c.length <= MAX_CODE_BITS ? BigInt(`0b${c}`) : BigInt(i), width }));
}

/** The machine `m`'s encoding set to `enc`, in place: made the user's, each state with no code given the one it had
 *  (`bitsOf(id)`, its code in the encoding before), the codes a state has kept for when it is the user's again. */
export function setEncoding(m, enc, bitsOf) {
  if (enc === USER_ENCODING && m.encoding !== USER_ENCODING) for (const s of m.states) if (!cleanCode(s.code)) s.code = bitsOf(s.id) ?? '';
  m.encoding = enc;
}

/** The machine `m` with the state `id`'s code set to `text` (cleaned; empty: none), in place: the encoding made the
 *  user's, the other states given the codes they had (`bitsOf(id)`: a state's code in the encoding before) when they
 *  have none. */
export function setStateCode(m, id, text, bitsOf) {
  setEncoding(m, USER_ENCODING, bitsOf);
  const s = m.states.find((x) => x.id === id);
  if (!s) return;
  const c = cleanCode(text);
  if (c) s.code = c; else delete s.code;
}
