// Silinx - the synchronous reactive model's C generator for the Arduino (#5486, core/reactive.js): an Arduino sketch
// (C that is also C++) as a student writes one, its HAL the Arduino API's pinMode, digitalRead, digitalWrite and
// millis. One tick every TICK_MS milliseconds of loop(): the inputs read once at its start, the outputs of the present
// state (and of the inputs, for a Mealy output) set from their defaults, the next state chosen by a switch on the present
// one, the outputs written to their pins at its end; setup() sets the pins' modes and the reset state. The states are
// named constants (S_<name>), the pins too (PIN_<name>; a port of several bits an array of its pins, bit 0 first).
// A variable set and then read in the same tick (or a registered output, or a timer) keeps its next value apart
// (<name>_next) until the end of the tick, as the model's semantics read the present values; the others are set in
// place.
// A drawing in a System's CPU node is a unit of its node's program instead (generateUnit, #5486): its own C (or C++)
// file, every name in it static but its two functions, <name>_init() (setup()'s: the pins' modes, the reset state) and
// <name>_tick() (one tick), which the node's sketch (core/reactive-c-main.js) calls, so that several drawings make one
// program.
// Isomorphic ES module: no DOM and no Node APIs.
import { validateReactive, reactiveType } from './reactive.js';
import { exprReads } from './reactive-expr.js';
import { cConst, cExpr, cType, cValue } from './reactive-c-expr.js';
import { assignPins, apiPin } from './reactive-c-pins.js';

export const TICK_MS = 10;   // the default tick, ms

// C's and C++'s words, the Arduino API's names, and the sketch's own: a port or a variable of the same name is renamed
const C_WORDS = 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false class delete friend new operator private protected public template this throw try catch namespace using virtual explicit mutable typename asm alignas alignof and or not xor bitand bitor compl'.split(' ');
const ARDUINO = 'setup loop pinMode digitalRead digitalWrite analogRead analogWrite analogReference millis micros delay delayMicroseconds tone noTone shiftIn shiftOut pulseIn attachInterrupt detachInterrupt interrupts noInterrupts random randomSeed map constrain min max abs sq sqrt pow sin cos tan round bit bitRead bitWrite bitSet bitClear lowByte highByte byte word boolean String Serial HIGH LOW INPUT OUTPUT INPUT_PULLUP LED_BUILTIN PI A0 A1 A2 A3 A4 A5 A6 A7 uint8_t uint16_t uint32_t int8_t int16_t int32_t UINT32_C'.split(' ');
const OWN = 'state stepMachine lastTick readInputs writeOutputs resetMachine readBits writeBits State TICK_MS'.split(' ');
const TAKEN = new Set([...C_WORDS, ...ARDUINO, ...OWN]);

const lines = (body, ind) => body.map((l) => (l ? ind + l : l));
const bitsOf = (w) => `${w} bit${w === 1 ? '' : 's'}`;

/** The C names of the model's symbols: { names: Map(name -> C name), warnings }. */
function cNames(model) {
  const names = new Map(), warnings = [], seen = new Set();
  const all = [...model.inputs, ...model.outputs, ...model.vars, ...model.consts];
  for (const x of all) seen.add(x.name);
  for (const x of all) {
    let c = x.name;
    if (TAKEN.has(c) || /^(PIN|S)_/.test(c)) {
      c = `${x.name}_v`;
      while (seen.has(c)) c += '_';
      seen.add(c);
      warnings.push(`'${x.name}' is a word of C or of the Arduino API, or a name of the sketch's: it is ${c} in the sketch`);
    }
    names.set(x.name, c);
  }
  return { names, warnings };
}

/** The variables a tick may read after it set them (they need their next value apart). */
export function readAfterSet(model) {
  const need = new Set();
  const walk = (body, set) => {
    for (const s of body) {
      const reads = s.k === 'set' ? exprReads(s.expr) : s.k === 'if' ? exprReads(s.cond) : s.k === 'switch' ? exprReads(s.expr) : new Set();
      for (const n of reads) if (set.has(n)) need.add(n);
      if (s.k === 'set') set.add(s.target);
      if (s.k === 'if') { const a = new Set(set), b = new Set(set); walk(s.then, a); walk(s.else, b); for (const n of [...a, ...b]) set.add(n); }
      if (s.k === 'switch') { const all = [...s.cases.map((c) => c.body), s.others].map((b) => { const x = new Set(set); walk(b, x); return x; }); for (const x of all) for (const n of x) set.add(n); }
    }
  };
  const after = new Set();
  walk(model.every, after);
  for (const a of model.arms) walk(a.body, new Set(after));
  return need;
}

/**
 * The model's sketch: { code, filename (<name>.ino), pins: { port: [pins] }, warnings } or { errors } (messages).
 * opts: { pins: { port: [pins] | pin }, tickMs }.
 */
export function generateArduino(model, { pins: given = {}, tickMs = TICK_MS } = {}) { return generate(model, { pins: given, tickMs }); }

/**
 * The model as a unit of its node's program: { code, filename (<name>.c, or .cpp in C++), functions ([<name>_init,
 * <name>_tick]), pins, warnings } or { errors }. opts: { pins, lang: 'c' | 'cpp' }.
 */
export function generateUnit(model, { pins: given = {}, lang = 'c' } = {}) { return generate(model, { pins: given, unit: lang === 'cpp' ? 'cpp' : 'c' }); }

function generate(model, { pins: given, tickMs = TICK_MS, unit = null }) {
  const problems = validateReactive(model).filter((d) => d.severity === 'error').map((d) => d.message);
  if (problems.length) return { errors: problems };
  if (!(Number.isInteger(tickMs) && tickMs >= 1)) return { errors: [`The tick is ${tickMs} ms: a whole number of milliseconds, 1 or more`] };
  const pa = assignPins([...model.inputs, ...model.outputs], given);
  if (pa.errors.length) return { errors: pa.errors };
  const { names, warnings } = cNames(model);
  const width = new Map([...model.inputs, ...model.outputs, ...model.vars].map((x) => [x.name, x.width]).concat(model.consts.map((c) => [c.name, 32])));
  const sym = (n) => ({ c: names.get(n) ?? n, width: width.get(n) ?? 1 });
  const nextOf = new Set([...readAfterSet(model), ...model.vars.filter((v) => v.timer).map((v) => v.name), ...model.outputs.filter((o) => o.registered).map((o) => o.name)]);
  const comb = new Set(model.outputs.filter((o) => !o.registered).map((o) => o.name));
  const cn = (n) => names.get(n);
  const target = (n) => (nextOf.has(n) ? `${cn(n)}_next` : cn(n));
  const pinName = (p) => `PIN_${cn(p.name).toUpperCase()}`;
  // (a unit's state type named after it: C++'s one definition of a type across the node's program, -Wodr)
  const stateType = unit ? `${model.name}_State` : 'State';

  // ---- the statements
  const stmts = (body, armState) => body.flatMap((s) => stmt(s, armState));
  const block = (body, armState) => lines(stmts(body, armState), '  ');
  const cond = (e) => cExpr(e, sym).s;
  const stmt = (s, armState) => {
    if (s.k === 'set') return [`${target(s.target)} = ${cValue(s.expr, width.get(s.target), sym)};`];
    if (s.k === 'go') return [s.state === armState ? `state = S_${s.state};   // (stays)` : `state = S_${s.state};`];
    if (s.k === 'if') return ifChain(s, armState);
    const out = [`switch (${cond(s.expr)}) {`];
    for (const c of s.cases) out.push(...c.values.map((v) => `  case ${cConst(v)}:`), ...lines(stmts(c.body, armState), '    '), '    break;');
    if (s.others.length) out.push('  default:', ...lines(stmts(s.others, armState), '    '), '    break;');
    out.push('}');
    return out;
  };
  const ifChain = (s, armState) => {
    const then = s.then.length ? s.then : null;
    const head = then ? `if (${cond(s.cond)}) {` : `if (${s.cond.k === 'not' ? cond(s.cond.a) : `!(${cond(s.cond)})`}) {`;
    const out = [head, ...block(then || s.else, armState)];
    let els = then ? s.else : [];
    while (els.length === 1 && els[0].k === 'if' && els[0].then.length) {
      out.push(`} else if (${cond(els[0].cond)}) {`, ...block(els[0].then, armState));
      els = els[0].else;
    }
    if (els.length) out.push('} else {', ...block(els, armState));
    out.push('}');
    return out;
  };

  // ---- the sketch
  const type = reactiveType(model);
  const what = { combinational: 'combinational logic', moore: 'a Moore machine', mealy: 'a Mealy machine' }[type];
  const kind = { fsm: 'state diagram', asm: 'ASM chart', petri: 'Petri net', table: 'truth table' }[model.from] || 'drawing';
  const pinsText = (list) => list.map((p) => `${p.name} ${pa.pins[p.name].join(' ')}`).join(', ');
  const L = [
    `// ${model.name}: ${what}, generated by Silinx from the ${kind} ${model.source || model.name} (edit the drawing, not this file).`,
    ...(unit ? [`// One tick each call of ${model.name}_tick() (the node's sketch calls it every tick, its setup() ${model.name}_init()): the`,
      '// inputs read once at its start, the outputs written to their pins at its end (Silinx\'s synchronous reactive model:',
      '// docs/SYSTEMS.md).']
      : ['// One tick every TICK_MS milliseconds: the inputs read once at its start, the outputs written to their pins at its end',
        '// (Silinx\'s synchronous reactive model: docs/SYSTEMS.md).']),
  ];
  if (model.inputs.length) L.push(`// Inputs: ${pinsText(model.inputs)}.`);
  if (model.outputs.length) L.push(`// Outputs: ${pinsText(model.outputs)}.`);
  if ([...model.inputs, ...model.outputs].some((p) => p.width > 1)) L.push('// (a port of several bits: its pins bit 0 first)');
  L.push('', '#include <Arduino.h>', '', '// ---- the pins');
  for (const p of [...model.inputs, ...model.outputs]) {
    // (a unit's: A0 by its number, C's initializer a constant; its names static, its node's other units' apart)
    const ps = pa.pins[p.name].map((x) => (unit && x[0] === 'A' ? `${14 + Number(x.slice(1))} /* ${x} */` : apiPin(x)));
    const st = unit ? 'static ' : '';
    L.push(p.width === 1 ? `${st}const uint8_t ${pinName(p)} = ${ps[0]};` : `${st}const uint8_t ${pinName(p)}[${p.width}] = { ${ps.join(', ')} };`);
  }
  if (!unit) L.push('', `const unsigned long TICK_MS = ${tickMs};   // the tick's period`);
  if (model.consts.length) L.push('', '// ---- the constants', ...model.consts.map((c) => `${unit ? 'static ' : ''}const uint32_t ${cn(c.name)} = ${cConst(c.value)};`));
  if (model.states.length) {
    L.push('', '// ---- the states');
    L.push(`enum ${stateType} { ${model.states.map((s) => `S_${s.name}`).join(', ')} };`);
    for (const s of model.states) if (s.comment) L.push(`//   ${s.name}: ${s.comment.replace(/\s*\n\s*/g, ' ')}`);
  }
  const decl = (x, note) => `static ${cType(x.width)} ${cn(x.name)};${note ? `   // ${note}` : ''}`;
  if (model.inputs.length) L.push('', '// ---- the inputs, read once per tick', ...model.inputs.map((i) => decl(i, i.width > 1 ? bitsOf(i.width) : '')));
  if (model.outputs.length) L.push('', '// ---- the outputs', ...model.outputs.map((o) => decl(o, [o.width > 1 ? bitsOf(o.width) : '', o.registered ? 'registered: its value of the last tick' : ''].filter(Boolean).join(', '))));
  if (model.states.length || model.vars.length) {
    L.push('', '// ---- the memory');
    if (model.states.length) L.push(`static enum ${stateType} state;`);
    for (const v of model.vars) L.push(decl(v, [bitsOf(v.width), v.timer ? 'a timer: ticks counted' : '', v.comment || ''].filter(Boolean).join(', ')));
  }
  const multiIn = model.inputs.some((i) => i.width > 1), multiOut = model.outputs.some((o) => o.width > 1);
  if (multiIn) L.push('', '// a number from its pins, bit 0 first', 'static uint32_t readBits(const uint8_t *pins, uint8_t n) {', '  uint32_t v = 0;',
    '  for (uint8_t i = 0; i < n; i++) if (digitalRead(pins[i]) == HIGH) v |= (uint32_t)1 << i;', '  return v;', '}');
  if (multiOut) L.push('', '// a number to its pins, bit 0 first', 'static void writeBits(const uint8_t *pins, uint8_t n, uint32_t v) {',
    '  for (uint8_t i = 0; i < n; i++) digitalWrite(pins[i], (v >> i) & 1 ? HIGH : LOW);', '}');
  L.push('', 'static void readInputs(void) {');
  for (const i of model.inputs) L.push(i.width === 1 ? `  ${cn(i.name)} = digitalRead(${pinName(i)}) == HIGH;` : `  ${cn(i.name)} = readBits(${pinName(i)}, ${i.width});`);
  L.push('}', '', 'static void writeOutputs(void) {');
  for (const o of model.outputs) L.push(o.width === 1 ? `  digitalWrite(${pinName(o)}, ${cn(o.name)} ? HIGH : LOW);` : `  writeBits(${pinName(o)}, ${o.width}, ${cn(o.name)});`);
  L.push('}', '', '// the reset state', 'static void resetMachine(void) {');
  if (model.states.length) L.push(`  state = S_${model.initial};`);
  for (const v of model.vars) L.push(`  ${cn(v.name)} = ${cConst(v.init)};`);
  for (const o of model.outputs.filter((x) => x.registered)) L.push(`  ${cn(o.name)} = ${cConst(o.default)};`);
  L.push('}', '');
  L.push(model.states.length ? '// one tick: the outputs of the present state and of the inputs, then the next state' : '// one tick: the outputs of the inputs', 'static void stepMachine(void) {', '  readInputs();');
  const nexts = [...nextOf].map((n) => model.vars.find((v) => v.name === n) || model.outputs.find((o) => o.name === n));
  for (const x of nexts) {
    const mx = cConst((1n << BigInt(x.width)) - 1n);
    L.push(x.timer ? `  ${cType(x.width)} ${cn(x.name)}_next = ${cn(x.name)} < ${mx} ? ${cn(x.name)} + 1 : ${cn(x.name)};   // (a timer counts ticks)` : `  ${cType(x.width)} ${cn(x.name)}_next = ${cn(x.name)};`);
  }
  // (an output every tick sets first thing needs no default)
  const always = new Set(model.every.filter((s) => s.k === 'set').map((s) => s.target));
  const defaults = model.outputs.filter((o) => comb.has(o.name) && !always.has(o.name));
  if (defaults.length) L.push('  // the outputs\' defaults', ...defaults.map((o) => `  ${cn(o.name)} = ${cConst(o.default)};`));
  L.push(...lines(stmts(model.every, null), '  '));
  if (model.states.length) {
    L.push('  switch (state) {');
    for (const a of model.arms) L.push(`    case S_${a.state}:`, ...lines(stmts(a.body, a.state), '      '), '      break;');
    L.push('  }');
  }
  L.push('  writeOutputs();');
  for (const x of nexts) L.push(`  ${cn(x.name)} = ${cn(x.name)}_next;`);
  L.push('}', '', unit ? `// setup()'s: the pins' modes, the reset state\nvoid ${model.name}_init(void) {` : 'void setup() {');
  for (const i of model.inputs) L.push(i.width === 1 ? `  pinMode(${pinName(i)}, INPUT);` : `  for (uint8_t i = 0; i < ${i.width}; i++) pinMode(${pinName(i)}[i], INPUT);`);
  for (const o of model.outputs) L.push(o.width === 1 ? `  pinMode(${pinName(o)}, OUTPUT);` : `  for (uint8_t i = 0; i < ${o.width}; i++) pinMode(${pinName(o)}[i], OUTPUT);`);
  if (unit) {
    L.push('  resetMachine();', '}', '', '// one tick', `void ${model.name}_tick(void) {`, '  stepMachine();', '}', '');
    return { code: L.join('\n'), filename: `${model.name}.${unit}`, functions: [`${model.name}_init`, `${model.name}_tick`], pins: pa.pins, warnings: [...pa.warnings, ...warnings] };
  }
  L.push('  resetMachine();', '}', '', 'void loop() {', '  static unsigned long lastTick = 0;', '  if (millis() - lastTick < TICK_MS) return;',
    '  lastTick += TICK_MS;', '  stepMachine();', '}', '');
  return { code: L.join('\n'), filename: `${model.name}.ino`, pins: pa.pins, warnings: [...pa.warnings, ...warnings] };
}
