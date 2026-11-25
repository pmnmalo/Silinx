// The parts of the open synthesis (#405: out of packages/silinx-fpga/src/synth-open.js): running Yosys (synth-open-yosys.js: a failed run's
// message, its output as lines, the worker's source), the critical path of a netlist (synth-open-path.js) and the
// depth-oriented mappings of synthesizeOpen (synth-open-depth.js). synth-open.js still exports what moved. A small
// design synthesized: the depth mappings tried (the depth-oriented one, the wide, ABC9 and speed remaps), none kept,
// their estimates the usual netlist's; its levels, critical path and estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as so from '../packages/silinx-fpga/src/synth-open.js';
import { yosysError, lineStream, yosysWorkerSource, asText, quietLines, runYosysOnce } from '../packages/silinx-fpga/src/synth-open-yosys.js';
import { pathEnds, logicLevels, criticalDelay, deepDesign, DEEP_RULE } from '../packages/silinx-fpga/src/synth-open-path.js';
import { mountDepth } from '../packages/silinx-fpga/src/synth-open-depth.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { compile, elaborate } from '../core/compile.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

test('#405 open synthesis parts: synth-open.js exports what moved', () => {
  assert.deepEqual([so.yosysError, so.lineStream, so.yosysWorkerSource, so.asText], [yosysError, lineStream, yosysWorkerSource, asText]);
  assert.deepEqual([so.pathEnds, so.logicLevels, so.criticalDelay, so.deepDesign, so.DEEP_RULE], [pathEnds, logicLevels, criticalDelay, deepDesign, DEEP_RULE]);
  assert.equal(typeof mountDepth, 'function');
});

test('#405 open synthesis parts, running Yosys: a failed run\'s message, the output as lines, the worker\'s source', () => {
  assert.deepEqual(yosysError({ code: 1 }), { message: 'Yosys failed (exit code 1)', code: 1, crash: false });
  assert.equal(yosysError(new RangeError('Maximum call stack size exceeded')).crash, true);
  const lines = [];
  const feed = lineStream((l) => lines.push(l));
  const enc = new TextEncoder();
  feed(enc.encode('one\r\ntw')); feed(enc.encode('o\n\x1b[1mthree\x1b[0m\nfou')); feed.end();
  assert.deepEqual(lines, ['one', 'two', 'three', 'fou']);
  assert.equal(asText(enc.encode('x')), 'x');
  // the worker's text: a classic script (no export), with the helpers it needs
  const src = yosysWorkerSource('https://example.invalid/yosys.js');
  assert.match(src, /^const asText = /m);
  assert.doesNotMatch(src, /^export /m);
  assert.doesNotThrow(() => new Function(src));
  assert.match(src, /^const quietLines = /m);
});

test('#5604 a run\'s warnings read from its log ("Suppressed <warning>"): each once in a quiet run, a warning of several lines; not ABC\'s', () => {
  const log = [
    '', '1. Executing Verilog-2005 frontend: w.v', 'Suppressed w.v:1: Warning: Identifier `\\u\' is implicitly declared.',
    '  indented line of another message', 'Suppressed Warning: multiple conflicting drivers for top.\\y:', '    port Y[0] of cell $a ($_AND_)',
    '    port Y[0] of cell $b ($_OR_)', 'ABC: Warning: The network is combinational (run "fraig" or "fraig_sweep").',
    'Suppressed w.v:3: Warning: Identifier `\\u\' is implicitly declared.', 'Suppressed Warning: Shift register inference not yet supported for family xc3se.',
    'Suppressed Warning: Shift register inference not yet supported for family xc3se.', 'Found and reported 1 problems.', '',
  ].join('\n');
  const first = [
    'w.v:1: Warning: Identifier `\\u\' is implicitly declared.',
    'Warning: multiple conflicting drivers for top.\\y:', '    port Y[0] of cell $a ($_AND_)', '    port Y[0] of cell $b ($_OR_)',
    'Warning: Shift register inference not yet supported for family xc3se.',
  ];
  assert.deepEqual(quietLines(log), first);
  assert.deepEqual(quietLines(log, false), [...first.slice(0, 4), 'w.v:3: Warning: Identifier `\\u\' is implicitly declared.', first[4], first[4]]);
  assert.deepEqual(quietLines(''), []);
});

test('#5604 a Yosys script runs quiet with its log in a file, its warnings as log lines: its lines from the log, a quiet run\'s as its console\'s, of a failed run too', async () => {
  const LOG = 'silinx_yosys.log';
  const calls = [];
  const enc = s => new TextEncoder().encode(s);
  const fake = log => async (args, files, { stdout, stderr }) => {
    calls.push({ args, files: Object.keys(files) });
    if (args.includes('-l')) {
      if (args.at(-1).includes('fail')) { stderr(enc('ERROR: it failed\n')); throw Object.assign(new Error('Exited with status 1'), { code: 1, files: { ...files, [LOG]: enc(log + 'ERROR: it failed\n') } }); }
      return { ...files, [LOG]: enc(log), 'o.json': enc('{}') };
    }
    stdout(enc('console line\n'));
    return { ...files, 'o.json': '{}' };
  };
  const log = '\x1b[1m-- Running command\x1b[0m\r\nABC: + pdr\nSuppressed Warning: w1\nSuppressed Warning: w1\n';
  const lines = [];
  // a quiet run: Yosys quiet, its log in a file, its warnings made log lines; each warning once; the files back without the log
  let out = await runYosysOnce(fake(log), ['-q', '-p', 'read_verilog a.v; abc'], { 'a.v': 'x' }, l => lines.push(l));
  assert.deepEqual(calls.at(-1), { args: ['-q', '-l', LOG, '-p', 'logger -nowarn .; read_verilog a.v; abc'], files: ['a.v'] });
  assert.deepEqual(lines, ['Warning: w1']);
  assert.deepEqual(Object.keys(out).sort(), ['a.v', 'o.json']);
  // another run of ABC: every line of its log, plain, its warnings as warnings
  lines.length = 0;
  await runYosysOnce(fake(log), ['-p', 'read_verilog a.v; abc -script x.abc'], { 'a.v': 'x' }, l => lines.push(l));
  assert.deepEqual(lines, ['-- Running command', 'ABC: + pdr', 'Warning: w1', 'Warning: w1']);
  // a failed one: its warnings, then the console's error
  lines.length = 0;
  await assert.rejects(runYosysOnce(fake(log), ['-q', '-p', 'fail; synth'], {}, l => lines.push(l)), { message: 'Yosys failed (exit code 1)', code: 1 });
  assert.deepEqual(lines, ['Warning: w1', 'ERROR: it failed']);
  // a run with no ABC nor synth pass, or other arguments: as they are, its lines as said
  for (const args of [['-p', 'read_verilog a.v; sat -tempinduct'], ['-V'], ['-q', '-s', 'x.ys']]) {
    lines.length = 0;
    out = await runYosysOnce(fake(log), args, { 'a.v': 'x' }, l => lines.push(l));
    assert.deepEqual(calls.at(-1).args, args);
    assert.deepEqual(lines, ['console line']);
  }
});

test('#5604 a warning after an ABC run (YoWASP\'s Yosys 0.71 threw at it): said, the run ends', { timeout: 120000 }, async () => {
  const lines = [];
  const out = await yosysNode(['-q', '-p', 'read_verilog t.v; techmap; abc; read_verilog w.v; write_json o.json'], {
    't.v': 'module top(input a, b, output y); assign y = a & b; endmodule\n', 'w.v': 'module w(output y); assign y = u; endmodule\n',
  }, l => lines.push(l));
  assert.deepEqual(lines, ['w.v:1: Warning: Identifier `\\u\' is implicitly declared.']);
  assert.deepEqual(Object.keys(JSON.parse(out['o.json']).modules).sort(), ['top', 'w']);
});

test('#405 open synthesis parts: a comparator synthesized, the depth mappings tried, its path and levels', { timeout: 120000 }, async () => {
  const V = `module cmp(input [15:0] a, b, output lt, output [15:0] m);
  assign lt = a < b;
  assign m = (a & b) ^ {a[7:0], b[15:8]};
endmodule
`;
  const r = await synthesizeOpen(elaborate(compile([{ path: 'cmp.v', lang: 'verilog', text: V }]), 'cmp'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual([r.util.luts, r.util.carry, r.util.ios], [32, 8, 49]);
  // every depth mapping tried at High, none faster: the usual netlist kept
  assert.deepEqual(Object.keys(r.depth), ['tried', 'kept', 'ns', 'luts', 'wide', 'slices', 'abc9', 'speed']);
  assert.equal(r.depth.kept, false);
  for (const k of ['wide', 'abc9', 'speed']) assert.equal(r.depth[k].kept, false, k);
  const json = JSON.parse(r.files['cmp.json']);
  const ns = criticalDelay(json, 'cmp');
  assert.equal(ns, pathEnds(json, 'cmp').worst);
  assert.deepEqual(r.depth.ns, [ns, ns]);
  assert.equal(logicLevels(json, 'cmp'), 1);
  assert.equal(deepDesign(json, 'cmp'), false);
});
