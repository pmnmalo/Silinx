// Silinx - the synchronous reactive model's MicroPython generator (#5487, core/reactive.js): a MicroPython program as a
// student writes one, its HAL the `machine` module's Pin and the `time` module's ticks_ms, the same `.py` on the ESP32
// and on the Pico. The same ticks as the Arduino's C (core/reactive-c.js): one tick every TICK_MS milliseconds of the
// program's loop, the inputs read once at its start, the outputs of the present state (and of the inputs, for a Mealy
// output) set from their defaults, the next state chosen by an if / elif on the present one, the outputs written to their
// pins at its end; the reset state set before the loop. The states are named constants (S_<name>), the pins too
// (PIN_<name>; a port of several bits a tuple of its pins, bit 0 first). A variable set and then read in the same tick
// (or a registered output, or a timer) keeps its next value apart (<name>_next) until the end of the tick, as the
// model's semantics read the present values; the others are set in place.
// Isomorphic ES module: no DOM and no Node APIs.
import { validateReactive, reactiveType } from './reactive.js';
import { readAfterSet, TICK_MS } from './reactive-c.js';
import { pyConst, pyExpr, pyValue } from './reactive-py-expr.js';
import { assignPyPins, pinLabel, PY_BOARD, PY_BOARDS } from './reactive-py-pins.js';

export { TICK_MS };

// Python's words, the builtins, the modules' names the program uses, and the program's own: a port or a variable of the
// same name is renamed
const PY_WORDS = 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' ');
const BUILTINS = 'abs all any bin bool bytearray bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip'.split(' ');
const OWN = 'machine Pin time micropython const state step_machine read_inputs write_outputs reset_machine read_bits write_bits main last TICK_MS'.split(' ');
const TAKEN = new Set([...PY_WORDS, ...BUILTINS, ...OWN]);

const IND = '    ';
const lines = (body, ind) => body.map((l) => (l ? ind + l : l));
const bitsOf = (w) => `${w} bit${w === 1 ? '' : 's'}`;

/** The Python names of the model's symbols: { names: Map(name -> Python name), warnings }. */
function pyNames(model) {
  const names = new Map(), warnings = [], seen = new Set();
  const all = [...model.inputs, ...model.outputs, ...model.vars, ...model.consts];
  for (const x of all) seen.add(x.name);
  for (const x of all) {
    let c = x.name;
    if (TAKEN.has(c) || /^(PIN|S)_/.test(c)) {
      c = `${x.name}_v`;
      while (seen.has(c)) c += '_';
      seen.add(c);
      warnings.push(`'${x.name}' is a word of Python or of MicroPython, or a name of the program's: it is ${c} in the program`);
    }
    names.set(x.name, c);
  }
  return { names, warnings };
}

/**
 * The model's MicroPython program: { code, filename (<name>.py), pins: { port: [GPIO numbers] }, board, warnings } or {
 * errors } (messages). opts: { pins: { port: [pins] | pin }, board: 'esp32' | 'pico', tickMs }.
 */
export function generateMicroPython(model, { pins: given = {}, board = PY_BOARD, tickMs = TICK_MS } = {}) {
  const problems = validateReactive(model).filter((d) => d.severity === 'error').map((d) => d.message);
  if (problems.length) return { errors: problems };
  if (!PY_BOARDS[board]) return { errors: [`'${board}' is not a MicroPython board: ${Object.keys(PY_BOARDS).join(', ')}`] };
  if (!(Number.isInteger(tickMs) && tickMs >= 1)) return { errors: [`The tick is ${tickMs} ms: a whole number of milliseconds, 1 or more`] };
  const pa = assignPyPins([...model.inputs.map((i) => ({ ...i, dir: 'in' })), ...model.outputs.map((o) => ({ ...o, dir: 'out' }))], given, board);
  if (pa.errors.length) return { errors: pa.errors };
  const { names, warnings } = pyNames(model);
  const width = new Map([...model.inputs, ...model.outputs, ...model.vars].map((x) => [x.name, x.width]).concat(model.consts.map((c) => [c.name, 32])));
  const sym = (n) => ({ py: names.get(n) ?? n, width: width.get(n) ?? 1 });
  const nextOf = new Set([...readAfterSet(model), ...model.vars.filter((v) => v.timer).map((v) => v.name), ...model.outputs.filter((o) => o.registered).map((o) => o.name)]);
  const comb = new Set(model.outputs.filter((o) => !o.registered).map((o) => o.name));
  const pn = (n) => names.get(n);
  const target = (n) => (nextOf.has(n) ? `${pn(n)}_next` : pn(n));
  const pinName = (p) => `PIN_${pn(p.name).toUpperCase()}`;

  // ---- the statements
  const stmts = (body, armState) => body.flatMap((s) => stmt(s, armState));
  const block = (body, armState) => { const b = stmts(body, armState); return lines(b.length ? b : ['pass'], IND); };
  const cond = (e) => pyExpr(e, sym).s;
  const stmt = (s, armState) => {
    if (s.k === 'set') return [`${target(s.target)} = ${pyValue(s.expr, width.get(s.target), sym)}`];
    if (s.k === 'go') return [s.state === armState ? `state = S_${s.state}  # (stays)` : `state = S_${s.state}`];
    if (s.k === 'if') return ifChain(s, armState);
    // (a switch: an if / elif on its value, in the order of its cases)
    const v = pyExpr(s.expr, sym);
    const sel = v.p >= 8 ? v.s : `(${v.s})`;
    const out = [];
    s.cases.forEach((c, i) => {
      const test = c.values.length === 1 ? `${sel} == ${pyConst(c.values[0])}` : `${sel} in (${c.values.map(pyConst).join(', ')})`;
      out.push(`${i ? 'elif' : 'if'} ${test}:`, ...block(c.body, armState));
    });
    if (!s.cases.length) return stmts(s.others, armState);
    if (s.others.length) out.push('else:', ...block(s.others, armState));
    return out;
  };
  const ifChain = (s, armState) => {
    const then = s.then.length ? s.then : null;
    const head = then ? `if ${cond(s.cond)}:` : `if ${s.cond.k === 'not' ? pyExpr(s.cond.a, sym).s : `not (${cond(s.cond)})`}:`;
    const out = [head, ...block(then || s.else, armState)];
    let els = then ? s.else : [];
    while (els.length === 1 && els[0].k === 'if' && els[0].then.length) {
      out.push(`elif ${cond(els[0].cond)}:`, ...block(els[0].then, armState));
      els = els[0].else;
    }
    if (els.length) out.push('else:', ...block(els, armState));
    return out;
  };

  // ---- the program
  const B = PY_BOARDS[board];
  const type = reactiveType(model);
  const what = { combinational: 'combinational logic', moore: 'a Moore machine', mealy: 'a Mealy machine' }[type];
  const kind = { fsm: 'state diagram', asm: 'ASM chart', petri: 'Petri net', table: 'truth table' }[model.from] || 'drawing';
  const pinsText = (list) => list.map((p) => `${p.name} ${pa.pins[p.name].map((n) => pinLabel(n, board)).join(' ')}`).join(', ');
  const L = [
    `# ${model.name}: ${what}, generated by Silinx from the ${kind} ${model.source || model.name} (edit the drawing, not this file).`,
    `# MicroPython for the ${B.name}. One tick every TICK_MS milliseconds: the inputs read once at its start, the outputs`,
    `# written to their pins at its end (Silinx's synchronous reactive model: docs/SYSTEMS.md).`,
  ];
  if (model.inputs.length) L.push(`# Inputs: ${pinsText(model.inputs)}.`);
  if (model.outputs.length) L.push(`# Outputs: ${pinsText(model.outputs)}.`);
  if ([...model.inputs, ...model.outputs].some((p) => p.width > 1)) L.push('# (a port of several bits: its pins bit 0 first)');
  L.push('', 'from machine import Pin', 'import time', '', '# ---- the pins');
  const pinOf = (n, mode) => `Pin(${n}, Pin.${mode})`;
  for (const [list, mode] of [[model.inputs, 'IN'], [model.outputs, 'OUT']]) {
    for (const p of list) {
      const ps = pa.pins[p.name].map((n) => pinOf(n, mode));
      L.push(p.width === 1 ? `${pinName(p)} = ${ps[0]}` : `${pinName(p)} = (${ps.join(', ')})`);
    }
  }
  L.push('', `TICK_MS = ${tickMs}  # the tick's period`);
  if (model.consts.length) L.push('', '# ---- the constants', ...model.consts.map((c) => `${pn(c.name)} = ${pyConst(c.value)}`));
  if (model.states.length) {
    L.push('', '# ---- the states');
    model.states.forEach((s, i) => L.push(`S_${s.name} = ${i}${s.comment ? `  # ${s.comment.replace(/\s*\n\s*/g, ' ')}` : ''}`));
  }
  const decl = (x, v, note) => `${pn(x.name)} = ${v}${note ? `  # ${note}` : ''}`;
  if (model.inputs.length) L.push('', '# ---- the inputs, read once per tick', ...model.inputs.map((i) => decl(i, 0, i.width > 1 ? bitsOf(i.width) : '')));
  if (model.outputs.length) L.push('', '# ---- the outputs', ...model.outputs.map((o) => decl(o, pyConst(o.default), [o.width > 1 ? bitsOf(o.width) : '', o.registered ? 'registered: its value of the last tick' : ''].filter(Boolean).join(', '))));
  if (model.states.length || model.vars.length) {
    L.push('', '# ---- the memory');
    if (model.states.length) L.push(`state = S_${model.initial}`);
    for (const v of model.vars) L.push(decl(v, pyConst(v.init), [bitsOf(v.width), v.timer ? 'a timer: ticks counted' : '', v.comment || ''].filter(Boolean).join(', ')));
  }
  const multiIn = model.inputs.some((i) => i.width > 1), multiOut = model.outputs.some((o) => o.width > 1);
  if (multiIn) L.push('', '', '# a number from its pins, bit 0 first', 'def read_bits(pins):', `${IND}v = 0`, `${IND}for i in range(len(pins)):`,
    `${IND}${IND}if pins[i].value():`, `${IND}${IND}${IND}v |= 1 << i`, `${IND}return v`);
  if (multiOut) L.push('', '', '# a number to its pins, bit 0 first', 'def write_bits(pins, v):', `${IND}for i in range(len(pins)):`, `${IND}${IND}pins[i].value((v >> i) & 1)`);
  const globals = (list) => (list.length ? [`${IND}global ${list.join(', ')}`] : []);
  L.push('', '', 'def read_inputs():', ...globals(model.inputs.map((i) => pn(i.name))));
  for (const i of model.inputs) L.push(i.width === 1 ? `${IND}${pn(i.name)} = ${pinName(i)}.value()` : `${IND}${pn(i.name)} = read_bits(${pinName(i)})`);
  if (!model.inputs.length) L.push(`${IND}pass`);
  L.push('', '', 'def write_outputs():');
  for (const o of model.outputs) L.push(o.width === 1 ? `${IND}${pinName(o)}.value(${pn(o.name)})` : `${IND}write_bits(${pinName(o)}, ${pn(o.name)})`);
  if (!model.outputs.length) L.push(`${IND}pass`);
  const memory = [...(model.states.length ? ['state'] : []), ...model.vars.map((v) => pn(v.name)), ...model.outputs.filter((o) => o.registered).map((o) => pn(o.name))];
  L.push('', '', '# the reset state', 'def reset_machine():', ...globals(memory));
  if (model.states.length) L.push(`${IND}state = S_${model.initial}`);
  for (const v of model.vars) L.push(`${IND}${pn(v.name)} = ${pyConst(v.init)}`);
  for (const o of model.outputs.filter((x) => x.registered)) L.push(`${IND}${pn(o.name)} = ${pyConst(o.default)}`);
  if (!memory.length) L.push(`${IND}pass`);
  L.push('', '', model.states.length ? '# one tick: the outputs of the present state and of the inputs, then the next state' : '# one tick: the outputs of the inputs',
    'def step_machine():', ...globals([...memory, ...model.outputs.filter((o) => !o.registered).map((o) => pn(o.name))]), `${IND}read_inputs()`);
  const nexts = [...nextOf].map((n) => model.vars.find((v) => v.name === n) || model.outputs.find((o) => o.name === n));
  for (const x of nexts) {
    const mx = pyConst((1n << BigInt(x.width)) - 1n);
    L.push(x.timer ? `${IND}${pn(x.name)}_next = ${pn(x.name)} + 1 if ${pn(x.name)} < ${mx} else ${pn(x.name)}  # (a timer counts ticks)` : `${IND}${pn(x.name)}_next = ${pn(x.name)}`);
  }
  // (an output every tick sets first thing needs no default)
  const always = new Set(model.every.filter((s) => s.k === 'set').map((s) => s.target));
  const defaults = model.outputs.filter((o) => comb.has(o.name) && !always.has(o.name));
  if (defaults.length) L.push(`${IND}# the outputs' defaults`, ...defaults.map((o) => `${IND}${pn(o.name)} = ${pyConst(o.default)}`));
  L.push(...lines(stmts(model.every, null), IND));
  model.arms.forEach((a, i) => L.push(`${IND}${i ? 'elif' : 'if'} state == S_${a.state}:`, ...lines(block(a.body, a.state), IND)));
  L.push(`${IND}write_outputs()`);
  for (const x of nexts) L.push(`${IND}${pn(x.name)} = ${pn(x.name)}_next`);
  L.push('', '', '# the reset state, then a tick every TICK_MS milliseconds', 'def main():', `${IND}reset_machine()`, `${IND}last = time.ticks_ms()`, `${IND}while True:`,
    `${IND}${IND}if time.ticks_diff(time.ticks_ms(), last) >= TICK_MS:`, `${IND}${IND}${IND}last = time.ticks_add(last, TICK_MS)`, `${IND}${IND}${IND}step_machine()`,
    '', '', 'main()', '');
  return { code: L.join('\n'), filename: `${model.name}.py`, pins: pa.pins, board, warnings: [...pa.warnings, ...warnings] };
}
