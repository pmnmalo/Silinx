// The examples on the Intel (Altera) boards (#5380, INTEL_TARGETS): every example (gates … lock) on each of Terasic's DE boards,
// its constraints a QSF of every port bit on a pin of the board (the 4-digit display on the GPIO header), the board's I/O
// standards, its 50 MHz clock; Check Constraints clean; the project made for the board (its clock and its KEYs' level as the
// top's generics) elaborates; Intel Quartus Prime's build folder for it (#5378: its .qsf, its SDC, run.sh making the board's
// .rbf or .svf, #5379), its warnings exact: none but gates' (no clock: nothing for the Timing Analyzer to check). Quartus
// itself is not here: its runs are the ISE machine's, when one has it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { EXAMPLES, INTEL_TARGETS, example, exampleUcf, exampleProject } from './examples-lib.mjs';
import { QSF, bitstreamExtOf, deviceLabel } from '../packages/silinx-fpga/src/parts.js';
import { constraintsDiagnostics } from '../core/constraints-check.js';
import { compile, elaborate } from '../core/compile.js';
import { resolveBoard } from '../server/devices.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-examples-intel-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// the top's ports as exampleUcf takes them (a vector of one bit a bus)
const portsOf = name => {
  const ex = example(name);
  return elaborate(compile(ex.design), ex.project.top).top.ports.map(p => {
    const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar);
    return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null };
  });
};

test('INTEL_TARGETS: the six DE boards, each an Intel device of its own family', () => {
  assert.deepEqual(INTEL_TARGETS.map(t => [t.board, resolveBoard(t.board).device.family]), [['de10-lite', 'max10'], ['de0-cv', 'cyclone5'], ['de1-soc', 'cyclone5'],
    ['de10-nano', 'cyclone5'], ['de0-nano', 'cyclone4e'], ['de2-115', 'cyclone4e']]);
});

test('every example on every DE board: a QSF of every port bit, the board\'s pins and I/O standards, its clock; Check Constraints clean', () => {
  for (const t of INTEL_TARGETS) {
    const r = resolveBoard(t.board), board = { ...r.board, resources: r.resources };
    const pinOf = new Map(r.resources.flatMap(res => res.pins.map(p => [p, res])));
    for (const name of EXAMPLES) {
      const what = `${name} on ${t.board}`, ports = portsOf(name);
      const { text, unmatched } = exampleUcf(name, t);
      assert.deepEqual(unmatched, [], what);
      const m = QSF.read(text);
      assert.equal(Object.keys(m.assignments).length, ports.reduce((n, p) => n + p.width, 0), what);
      const locs = Object.values(m.assignments).map(a => a.loc);
      assert.equal(new Set(locs).size, locs.length, `${what}: a pin twice`);
      for (const [net, a] of Object.entries(m.assignments)) {
        assert.ok(pinOf.has(a.loc), `${what}: ${net} on ${a.loc}, no pin of the board`);
        assert.equal(a.iostandard.toLowerCase(), (pinOf.get(a.loc).pinIostandards?.[a.loc] || pinOf.get(a.loc).iostandard).toLowerCase(), `${what}: ${net}`);
      }
      assert.deepEqual(m.clocks, name === 'gates' ? [] : [{ net: 'clk', period: 20, duty: 50, name: 'clk' }], what);
      assert.deepEqual(constraintsDiagnostics('qsf', text, { ports, top: example(name).project.top, device: r.device, board }), [], what);
    }
  }
  // the display on the GPIO header (an external module), the buttons the KEYs, the switches and LEDs the board's own
  const qsf = QSF.read(exampleUcf('stopwatch', { board: 'de0-cv' }).text).assignments;
  const res = resolveBoard('de0-cv').resources, of = loc => res.find(x => x.pins.includes(loc)).name;
  assert.deepEqual(['seg<0>', 'an<0>', 'dp', 'btn<0>', 'led<0>'].map(n => of(qsf[n].loc)), ['gpio_0', 'gpio_0', 'gpio_0', 'btn', 'led']);
});

test('every example\'s project on every DE board: its top elaborates with the board\'s generics; Quartus\'s build folder, its warnings exact', async () => {
  const Q = await import('../server/quartus.js');
  for (const t of INTEL_TARGETS) {
    const r = resolveBoard(t.board), ext = bitstreamExtOf(r.device);
    for (const name of EXAMPLES) {
      const what = `${name} on ${t.board}`;
      const { dir, project } = exampleProject(name, t, tmp);
      assert.equal(project.constraints.endsWith('.qsf'), true, what);
      const g = await Q.generateQuartusBuild(project, dir);
      assert.deepEqual(g.warnings, name === 'gates' ? [`no clock in ${project.constraints} (# create_clock): the Timing Analyzer has no constraint to check`] : [], what);
      const build = path.join(dir, 'build'), top = project.top;
      const qsf = fs.readFileSync(path.join(build, `${top}.qsf`), 'utf8');
      assert.match(qsf, new RegExp(`\\nset_global_assignment -name DEVICE ${deviceLabel(r.device)}\\nset_global_assignment -name TOP_LEVEL_ENTITY ${top}\\n`), what);
      assert.equal(fs.existsSync(path.join(build, `${top}.sdc`)), name !== 'gates', what);
      assert.match(fs.readFileSync(path.join(build, 'run.sh'), 'utf8'), new RegExp(`quartus_cpf .*output_files/${top}\\.sof ${top}\\${ext}; \\}`), what);
      // (the project's top as the board makes it, with the example's other sources (isqrt's C function's HDL): it elaborates, no error)
      const sources = example(name).design.map(s => (fs.existsSync(path.join(dir, s.path)) ? { ...s, text: fs.readFileSync(path.join(dir, s.path), 'utf8') } : s));
      const lib = compile(sources);
      assert.deepEqual(lib.errors.filter(e => e.severity === 'error'), [], what);
      assert.deepEqual(elaborate(lib, top).diags.filter(e => e.severity === 'error'), [], what);
    }
  }
  // the board's clock and its KEYs (active low) as blinky's generics
  const { dir } = exampleProject('blinky', { board: 'de10-lite' }, tmp);
  const text = fs.readdirSync(path.join(dir, 'src')).map(f => fs.readFileSync(path.join(dir, 'src', f), 'utf8')).join('\n');
  assert.match(text, /CLK_HZ\s*:\s*integer\s*:=\s*50_000_000|parameter\s+(integer\s+)?CLK_HZ\s*=\s*50000000/);
});
