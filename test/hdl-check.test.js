// The check of an HDL file as one types (#4773): core/hdl-check.js (the page's former check, now shared with its Web
// Worker; with `clean`, no elaboration of a file that does not read) and core/compile.js's kept parses (a file parsed
// again only when its text, what it includes or the package types it was read with changed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { designSize, hdlCheck } from '../core/hdl-check.js';
import { compile, elaborate, parseStats } from '../core/compile.js';
import { reservedModuleDiags } from '../core/reserved.js';
import { designChecks } from '../core/lint.js';

const KEEP = { keep: true };
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// web/js/processes.js hdlDiagnostics as it was before #4773 (S and the page aside): the reference (#5222: one signal,
// one process said in the singular)
const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function oldCheck(path, sources, lint) {
  const info = [];
  const lib = compile(sources);
  const units = (lib.parsed.find(p => p.file === path)?.units || []).filter(u => u.kind === 'module');
  const diags = [...lib.errors, ...reservedModuleDiags(units.map(u => ({ name: u.name, file: path, line: u.loc?.line })))];
  for (const u of units) {
    let design;
    try { design = elaborate(lib, u.name); } catch (e) { diags.push({ file: path, line: u.loc?.line || 1, col: 1, severity: 'error', message: e.message }); continue; }
    let checks;
    try { checks = designChecks(lib, design, { lint }); } catch { checks = []; }
    diags.push(...design.diags, ...checks);
    if (design.top) info.push(`Elaborating module <${u.name}>: ${counted(design.signals.length, 'signal', 'signals')}, ${counted(design.procs.length, 'process', 'processes')}.`);
  }
  return { diags, info };
}

// an example's HDL sources, as the page has them: [{ path, lang, role, text }]
function exampleSources(name) {
  const dir = path.join(ROOT, 'examples', name);
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  return (pj.files || []).filter(f => /\.(vhdl?|v)$/i.test(f.path) && fs.existsSync(path.join(dir, f.path)))
    .map(f => ({ path: f.path, lang: /\.v$/i.test(f.path) ? 'verilog' : 'vhdl', role: f.role || 'design', text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
}
const EXAMPLES = ['gates', 'breadboard', 'traffic', 'blinky', 'pong', 'stopwatch', 'clock', 'vga', 'isqrt', 'uart', 'micro80', 'lock'];

test('#4773 hdlCheck: the diagnostics and the elaboration lines of the page\'s former check, every HDL file of the examples, lint on and off', () => {
  let files = 0;
  for (const ex of EXAMPLES) {
    const sources = exampleSources(ex);
    assert.ok(sources.length, ex);
    for (const s of sources) for (const lint of [true, false]) {
      const want = oldCheck(s.path, sources, lint);
      assert.deepEqual(hdlCheck({ path: s.path, sources, lint }), want, `${ex}: ${s.path}`);
      assert.deepEqual(hdlCheck({ path: s.path, sources, lint, clean: true }), want, `${ex}: ${s.path}: read without an error, the same`);
      // the worker's, its parses kept: the same, the first check and the next ones
      for (let k = 0; k < 2; k++) assert.deepEqual(hdlCheck({ path: s.path, sources, lint, clean: true, keep: true }), want, `${ex}: ${s.path}: kept parses, check ${k + 1}`);
      files++;
    }
  }
  assert.ok(files >= 40, `${files} checks`);
});

const verilog = (body, extra = '') => ({ path: 'a.v', lang: 'verilog', role: 'design', text: `${extra}module a(input x, output y);\n${body}\nendmodule\n` });

test('#4773 hdlCheck clean: a file that does not read is not elaborated (its parse errors only); one that reads is', () => {
  const both = [verilog('assign y = zz;\nassign = ;')];
  assert.deepEqual(hdlCheck({ path: 'a.v', sources: both, clean: true }).diags.map(d => [d.line, d.severity, d.message]),
    [[3, 'error', "expected identifier but found '='"]]);
  assert.deepEqual(hdlCheck({ path: 'a.v', sources: both, clean: true }).info, []);
  assert.deepEqual(hdlCheck({ path: 'a.v', sources: both }).diags.map(d => [d.line, d.message]),
    [[3, "expected identifier but found '='"], [2, "'zz' is not declared"]], 'Check Syntax: elaborated still');
  // another file's error: this one elaborated
  const other = [verilog('assign y = zz;'), { path: 'b.v', lang: 'verilog', role: 'design', text: 'module b; assign = ; endmodule\n' }];
  assert.deepEqual(hdlCheck({ path: 'a.v', sources: other, clean: true }).diags.map(d => [d.file, d.message]),
    [['b.v', "expected identifier but found '='"], ['a.v', "'zz' is not declared"]]);
  // a warning (no error): elaborated
  const warned = hdlCheck({ path: 'a.v', sources: [verilog('wire unused;\nassign y = x;')], clean: true });
  assert.equal(warned.info.length, 1);
  assert.ok(warned.diags.every(d => d.severity !== 'error'));
});

test('#5222 designSize: one signal and one process in the singular, none and several in the plural; Check Syntax\'s line', () => {
  const of = (s, p) => designSize({ signals: Array(s).fill({}), procs: Array(p).fill({}) });
  assert.equal(of(4, 1), '4 signals, 1 process');
  assert.equal(of(1, 2), '1 signal, 2 processes');
  assert.equal(of(0, 0), '0 signals, 0 processes');
  assert.equal(of(1, 1), '1 signal, 1 process');
  const one = hdlCheck({ path: 'a.v', sources: [verilog('assign y = ~x;')] });
  assert.deepEqual(one.info, ['Elaborating module <a>: 2 signals, 1 process.']);
  assert.deepEqual(one.diags, [], 'no warnings');
});

test('#4773 compile keeps the parses: the same sources parsed once; a change parses its file only; what it includes and its package types too', () => {
  const sources = exampleSources('pong');
  compile(sources, KEEP);
  let s0 = parseStats();
  const a = compile(sources.map(s => ({ ...s })), KEEP);
  let s1 = parseStats();
  assert.equal(s1.parsed - s0.parsed, 0, 'nothing parsed again');
  assert.equal(s1.reused - s0.reused, sources.length);
  // one file changed: it alone parsed again; the result as a compile of its own
  const changed = sources.map((s, i) => (i === 0 ? { ...s, text: `${s.text}\n` } : s));
  const b = compile(changed, KEEP);
  s0 = parseStats();
  assert.equal(s0.parsed - s1.parsed, 1);
  assert.deepEqual(b.errors, a.errors);
  // what compile adds to a parse (its role, its text) is on a copy: a parse kept for a test bench is a design's elsewhere
  const v = verilog('assign y = x;');
  compile([{ ...v, role: 'sim' }], KEEP);
  assert.equal(compile([v], KEEP).parsed[0].role, 'design');
  // an `include's text changed: the file parsed again (its width read anew)
  const defs = w => ({ path: 'defs.vh', lang: 'verilog', role: 'design', text: `\`define W ${w}\n` });
  const top = { path: 't.v', lang: 'verilog', role: 'design', text: '`include "defs.vh"\nmodule t(output [`W-1:0] q); assign q = 0; endmodule\n' };
  const width = srcs => elaborate(compile(srcs, KEEP), 't').signals.find(sg => sg.name === 'q').t.w;
  assert.equal(width([defs(4), top]), 4);
  s1 = parseStats();
  assert.equal(width([defs(4), top]), 4);
  assert.equal(parseStats().parsed - s1.parsed, 0);
  assert.equal(width([defs(8), top]), 8, 'its include changed');
  // a SystemVerilog package's types: a file read with them kept apart from the file read without
  const pkg = t => ({ path: 'p.sv', lang: 'verilog', role: 'design', text: `package p; typedef logic [${t}:0] w_t; endpackage\n` });
  const user = { path: 'u.sv', lang: 'verilog', role: 'design', text: 'import p::*;\nmodule u(output logic [3:0] q); w_t x; assign x = 0; assign q = x; endmodule\n' };
  assert.deepEqual(compile([pkg(3), user], KEEP).errors.filter(e => e.severity === 'error'), []);
  assert.deepEqual(compile([user], KEEP).errors.filter(e => e.severity === 'error').length > 0, true, 'no package: w_t unknown');
  assert.deepEqual(compile([pkg(3), user], KEEP).errors.filter(e => e.severity === 'error'), [], 'kept with the types again');
});

test('#4773 compile keeps the last 512 files\' parses: an older one parsed again', () => {
  const one = i => ({ path: `m${i}.v`, lang: 'verilog', role: 'design', text: `module m${i}; endmodule\n` });
  compile([one(0)], KEEP);
  let s = parseStats();
  compile([one(0)], KEEP);
  assert.equal(parseStats().parsed - s.parsed, 0, 'kept');
  compile(Array.from({ length: 520 }, (_, i) => one(i + 1)), KEEP);
  s = parseStats();
  compile([one(0)], KEEP);
  assert.equal(parseStats().parsed - s.parsed, 1, 'dropped');
  s = parseStats();
  compile([one(520)], KEEP);
  assert.equal(parseStats().parsed - s.parsed, 0, 'the newest kept');
});

test('#4773 compile keeps the parses apart from what the library and the elaboration change in them: a VHDL entity and its architecture in two files, compiled again, no declaration twice', () => {
  const ent = { path: 'acc_ent.vhd', lang: 'vhdl', role: 'design', text: 'library ieee;\nuse ieee.std_logic_1164.all;\nentity acc is port (clk : in std_logic; q : out std_logic); end acc;\n' };
  const arch = { path: 'acc_arch.vhd', lang: 'vhdl', role: 'design', text: 'library ieee;\nuse ieee.std_logic_1164.all;\narchitecture rtl of acc is\n  signal nxt : std_logic := \'0\';\nbegin\n  process (clk) begin if rising_edge(clk) then nxt <= not nxt; end if; end process;\n  q <= nxt;\nend rtl;\n' };
  const fresh = hdlCheck({ path: 'acc_arch.vhd', sources: [ent, arch] });
  assert.deepEqual(fresh.diags, [], 'no warnings');
  assert.equal(fresh.info.length, 0, 'an architecture file defines no module of its own');
  const want = elaborate(compile([ent, arch]), 'acc').diags;
  assert.deepEqual(want, [], 'no warnings');
  for (let k = 0; k < 3; k++) {
    const lib = compile([ent, arch], KEEP);
    assert.deepEqual(lib.modules.get('acc').decls.filter(d => d.name === 'nxt').length, 1, `compile ${k + 1}: nxt declared once`);
    assert.deepEqual(elaborate(lib, 'acc').diags, want, `compile ${k + 1}: no 'nxt' redeclared`);
    assert.deepEqual(hdlCheck({ path: 'acc_ent.vhd', sources: [ent, arch], keep: true }), hdlCheck({ path: 'acc_ent.vhd', sources: [ent, arch] }), `check ${k + 1}`);
  }
});

test('#4773 compile without keep parses every time (synthesis, simulation, the tests: nothing kept)', () => {
  const v = verilog('assign y = x;');
  const s = parseStats();
  compile([v]); compile([v]);
  assert.deepEqual(parseStats(), s);
});
