// Silinx - the engines of Verify Equivalence for larger designs (#3262), both inside Yosys WASM (the browser's as the
// server's), no other program:
//   1. a structural proof: Yosys's equivalence passes (equiv_make, equiv_simple, equiv_induct, equiv_status) match the
//      two modules' signals by name and prove each pair equal by induction, assuming the others (register
//      correspondence); equiv_* ignore the initial values, so the base case is checked apart (`sat -seq 1` on the pairs
//      as assertions, the registers at their initial values). It proves a module against a transformed copy of itself
//      (its flat Verilog, a refactoring) in seconds whatever its size (stopwatch's 1024-word memory, micro80);
//   2. otherwise ABC (linked into Yosys, run by its `abc` pass on a module of one gate, the network kept aside in
//      &get / &put): the miter as an AIG, `bmc3` for the shortest difference in `depth` clock cycles, then `pdr` for a
//      proof for every input sequence (a combinational miter, no registers: `dsat`, its SAT solver). YoWASP's Yosys has no `sim`: the counterexample's cycles (the inputs, both
//      modules' outputs) come from ABC's witness replayed here on a second AIG of the same miter, with every output.
//
//   structuralScript() / abcScript(depth, seconds): the scripts; readStructural(lines) / readAbc(lines): their logs read;
//   replayWitness(files, ports): the counterexample's cycles, as readVerifyLog gives them (core/verify.js)

const REF = 'silinx_ref', UUT = 'silinx_uut', MITER = 'silinx_miter';
// the files of the ABC run: the miter's AIG (its one output, trigger) and its map (each input bit's wire), the AIG with
// every output (ASCII, replayed here; its symbols name its inputs and outputs, a constant one too, which a map leaves
// out), the witnesses of dsat, bmc3 and pdr
const AIG = `${MITER}.aig`;
export const AIG_MAP = `${MITER}.aim`, ALL = 'silinx_all.aag';
export const BMC_CEX = 'silinx_bmc.aiw', PDR_CEX = 'silinx_pdr.aiw', SAT_CEX = 'silinx_sat.aiw';
// the module of one gate the `abc` pass runs on (its network put back unchanged, so that Yosys reads it again)
const ABC_HOST = 'silinx_abc.v';
const HOST_TEXT = 'module silinx_abc(input a, b, output y); assign y = a & b; endmodule\n';

// the two modules read as Verify reads them (core/verify.js verifyScript)
const READ = `read_verilog -sv ${REF}.sv ${UUT}.sv; proc; memory; opt_clean; async2sync`;

/** The Yosys script of the structural proof: the base case (sat on the pairs as assertions), then the induction. */
export function structuralScript() {
  return [
    READ, 'flatten', 'opt_clean', 'design -save silinx_base',
    `equiv_make -make_assert ${REF} ${UUT} silinx_eqa`, 'hierarchy -top silinx_eqa', 'opt_clean',
    'sat -seq 1 -prove-asserts -set-init-zero silinx_eqa',
    'design -load silinx_base', `equiv_make ${REF} ${UUT} silinx_eq`, 'hierarchy -top silinx_eq', 'opt_clean',
    'equiv_simple', 'equiv_induct', 'equiv_status',
  ].join('; ');
}

/** The structural proof's log read: { proved, unproven (the pairs not proved), base (the base case holds) }. */
export function readStructural(lines) {
  const st = lines.map(l => /Of those cells (\d+) are proven and (\d+) are unproven/.exec(l)).filter(Boolean).pop();
  const base = lines.some(l => /^SAT proof finished - no model found: SUCCESS!/.test(l));
  const unproven = st ? +st[2] : null;
  return { proved: base && unproven === 0 && lines.some(l => /Equivalence successfully proven!/.test(l)), unproven, base };
}

// ABC's commands inline (`abc -script +cmd,arg;cmd`: Yosys turns the commas into blanks)
const inline = cmds => `+${cmds.map(c => c.trim().replace(/\s+/g, ',')).join(';')}`;

// pdr's time at most, in seconds: its memory grows with its frames (micro80's miter: 1.2 GB with Yosys's, 2.4 GB after
// 10 s, 3.3 GB after 20 s), and a design it does not prove in seconds it seldom proves at all
export const PDR_SECONDS = 10;

/**
 * The Yosys script of ABC's check, at most `depth` clock cycles, bmc3 given `seconds` at most, pdr as much up to
 * PDR_SECONDS: the miter (its registers at their initial values, 0 when they have none; an undefined bit 0), its AIGs,
 * then ABC.
 */
export function abcScript(depth, seconds) {
  const T = Math.max(1, Math.floor(seconds));
  return [
    READ, `miter -equiv -flatten -make_outputs ${REF} ${UUT} ${MITER}`, `hierarchy -top ${MITER}`, 'opt_clean',
    // (the inputs' copies no outputs: an input that is an output too, write_aiger takes for an undriven wire)
    'delete -output w:in_*', 'setundef -zero -init', 'techmap', 'opt -fast', 'dffunmap', 'setundef -zero', 'aigmap', 'opt_clean',
    `write_aiger -ascii -symbols -zinit ${ALL}`,
    // (the property: trigger alone)
    'delete -output w:gold_* w:gate_*', 'opt_clean', `write_aiger -zinit -map ${AIG_MAP} ${AIG}`,
    `design -reset`, `read_verilog ${ABC_HOST}`, 'hierarchy -top silinx_abc', 'techmap',
    // (dsat refuses a miter with registers, bmc3 one without)
    `abc -script ${inline(['strash', '&get -n', `read_aiger ${AIG}`, 'print_stats', 'dsat', `write_cex -a ${SAT_CEX}`, `bmc3 -F ${depth} -T ${T}`,
      `write_cex -a ${BMC_CEX}`, `pdr -T ${Math.min(T, PDR_SECONDS)}`, `write_cex -a ${PDR_CEX}`, '&put'])}`,
  ].join('; ');
}

/** The files of ABC's run, besides the two modules'. */
export const abcFiles = () => ({ [ABC_HOST]: HOST_TEXT });

/**
 * ABC's log read: { latches, bmc: { frame (the difference's, from 0) | checked (the cycles with none) | reached (every
 * reachable state explored: proved, a design of few registers) },
 * pdr: 'proved' | { frame } | null (undecided), sat (a combinational miter's): 'proved' | { frame: 0 } | null }.
 */
export function readAbc(lines) {
  const abc = lines.filter(l => l.startsWith('ABC: ')).map(l => l.slice(5));
  const latches = abc.map(l => /\blat\s*=\s*(\d+)/.exec(l)).filter(Boolean).map(m => +m[1])[0] ?? null;
  // (each command's lines: from its echo, "+ bmc3 …", to the next one)
  const of = cmd => { const i = abc.findIndex(l => l.startsWith(`+ ${cmd}`)); if (i < 0) return []; const j = abc.findIndex((l, k) => k > i && l.startsWith('+ ')); return abc.slice(i + 1, j < 0 ? undefined : j); };
  const asserted = ls => ls.map(l => /was asserted in frame (\d+)/.exec(l)).filter(Boolean).map(m => +m[1])[0];
  const b = of('bmc3'), p = of('pdr'), d = of('dsat');
  const bf = asserted(b);
  const none = b.map(l => /No output asserted in (\d+) frames/.exec(l)).filter(Boolean).map(m => +m[1])[0];
  const pf = asserted(p);
  return {
    latches,
    bmc: bf !== undefined ? { frame: bf } : b.some(l => /Explored all reachable states/.test(l)) ? { reached: true } : { checked: none ?? 0 },
    pdr: p.some(l => /Property proved/.test(l)) ? 'proved' : pf !== undefined ? { frame: pf } : null,
    sat: d.some(l => /^UNSATISFIABLE/.test(l)) ? 'proved' : d.some(l => /^SATISFIABLE/.test(l)) ? { frame: 0 } : null,
  };
}

/** An ASCII AIGER (Yosys's write_aiger -ascii): { I, L, inputs, latches: [[lit, next]], outputs, ands: [[lhs, a, b]] }. */
export function parseAag(text) {
  const lines = String(text).split('\n');
  const h = /^aag (\d+) (\d+) (\d+) (\d+) (\d+)/.exec(lines[0]);
  if (!h) throw new Error('not an ASCII AIGER file');
  const [M, I, L, O, A] = h.slice(1).map(Number);
  const nums = k => lines[k].trim().split(/\s+/).map(Number);
  let k = 1;
  const inputs = [], latches = [], outputs = [], ands = [];
  for (let i = 0; i < I; i++) inputs.push(nums(k++)[0]);
  for (let i = 0; i < L; i++) latches.push(nums(k++));
  for (let i = 0; i < O; i++) outputs.push(nums(k++)[0]);
  for (let i = 0; i < A; i++) ands.push(nums(k++));
  return { M, I, L, inputs, latches, outputs, ands };
}

/** A map of write_aiger -map: { input: [[bit, name]] by AIGER input, output: [[bit, name]] by AIGER output }. */
export function parseMap(text) {
  const m = { input: [], output: [] };
  for (const l of String(text).split('\n')) {
    const r = /^(input|output) (\d+) (\d+) (.+)$/.exec(l.trim());
    if (r) m[r[1]][+r[2]] = [+r[3], r[4].replace(/^\\/, '')];
  }
  return m;
}

/** An ASCII AIGER's symbols (write_aiger -symbols), as parseMap's: "o3 gold_q[1]" is output 3, bit 1 of gold_q. */
export function parseSymbols(text) {
  const m = { input: [], output: [] };
  for (const l of String(text).split('\n')) {
    const r = /^([io])(\d+) (.+?)(?:\[(\d+)\])?$/.exec(l.trim());
    if (r) m[r[1] === 'i' ? 'input' : 'output'][+r[2]] = [+(r[4] ?? 0), r[3].replace(/^\\/, '')];
  }
  return m;
}

/** ABC's witness (write_cex -a): the latches' initial values, then each frame's inputs (strings of 0 / 1). */
export function parseWitness(text) {
  const rows = String(text).split('\n').map(l => l.trim()).filter(l => /^[01x]*$/i.test(l) && !l.startsWith('#'));
  return { init: rows[0] ?? '', frames: rows.slice(1).filter(r => r.length) };
}

/**
 * ABC's witness replayed on the AIG with every output: the cycles of the counterexample, as readVerifyLog reads them
 * from Yosys's sat ({ in, uut, ref } of bit strings by port, its most significant bit first; trigger: the difference),
 * or null when there is no witness. files: the run's (AIG_MAP, ALL, ALL_MAP and the witness); cex: its file.
 */
export function replayWitness(files, cex) {
  if (!files?.[cex] || !files[ALL]) return null;
  const w = parseWitness(files[cex]);
  if (!w.frames.length) return null;
  const small = parseMap(files[AIG_MAP]), all = parseSymbols(files[ALL]), g = parseAag(files[ALL]);
  // each input of the miter's AIG, by its wire and bit, at its place in the AIG with every output
  const at = new Map(all.input.map((e, j) => e && [`${e[1]}[${e[0]}]`, j]).filter(Boolean));
  const val = new Uint8Array(g.M + 1);
  const lit = l => val[l >> 1] ^ (l & 1);
  // (the registers at 0: write_aiger -zinit, its registers that start at 1 inverted)
  let state = g.latches.map(() => 0);
  const cycles = [];
  for (const frame of w.frames) {
    val.fill(0);
    const ins = new Uint8Array(g.I);
    small.input.forEach((e, k) => { const j = e && at.get(`${e[1]}[${e[0]}]`); if (j !== undefined) ins[j] = frame[k] === '1' ? 1 : 0; });
    g.inputs.forEach((l, j) => { val[l >> 1] = ins[j]; });
    g.latches.forEach(([l], j) => { val[l >> 1] = state[j]; });
    for (const [l, a, b] of g.ands) val[l >> 1] = lit(a) & lit(b);
    const bits = {};
    // (the inputs, in_*: no outputs of the AIG)
    g.inputs.forEach((l, j) => { const e = all.input[j]; if (e) (bits[e[1]] ||= [])[e[0]] = ins[j]; });
    g.outputs.forEach((l, k) => { const e = all.output[k]; if (e) (bits[e[1]] ||= [])[e[0]] = lit(l); });
    const c = { in: {}, uut: {}, ref: {}, trigger: bits.trigger?.[0] === 1 };
    for (const [name, b] of Object.entries(bits)) {
      const m = /^(in|gold|gate)_(.*)$/.exec(name);
      if (m) c[{ in: 'in', gold: 'ref', gate: 'uut' }[m[1]]][m[2]] = [...b].reverse().map(x => x ?? 0).join('');
    }
    cycles.push(c);
    state = g.latches.map(([, next]) => lit(next));
  }
  return cycles;
}
