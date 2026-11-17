// nextpnr's runner (src/nextpnr-io.js, nextpnrIo): a run that fails rejects with an Error the flows can say (#4260). The
// package's Exit: its exit status; an exception with no message (nextpnr-himbaechel-xc7 stopping on an ERROR: line throws a
// WebAssembly.Exception, not an Exit): nextpnr's last ERROR: line, not undefined; any other error as it is. On a fake package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextpnrIo } from '../src/nextpnr-io.js';

class Exit extends Error { constructor(code) { super(`exit ${code}`); this.code = code; } }
const bytes = s => new TextEncoder().encode(s);
// a package whose runner writes `text` to its stderr (the last line without its newline), then ends as `end` says
const fake = (text, end) => nextpnrIo(async () => ({
  Exit,
  async runNextpnrHimbaechelXilinx(args, files, { stderr }) {
    stderr(bytes(text));
    return end();
  },
}), 'runNextpnrHimbaechelXilinx');
const wasmException = () => new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []);
const BEL = "Bel 'X10Y153/SLICE_X0Y0.A5FF' of type 'SLICE_FFX' is not valid for cell 'ff' of type 'SLICE_FFX'";
const run = async (np) => {
  const lines = [];
  try { return { lines, files: await np.run([], {}, l => lines.push(l)) }; } catch (error) { return { lines, error }; }
};

test('a WebAssembly exception (no message): the run rejects with nextpnr\'s last ERROR: line, each line said once (#4260)', async () => {
  assert.equal(wasmException().message, undefined);   // (why: the old run rejected with it as it is, its message undefined)
  const text = `Info: Placing..\nWarning: a warning\nERROR: Cell 'x' has no BEL\nERROR: ${BEL}`;
  const { lines, error } = await run(fake(text, () => { throw wasmException(); }));
  assert.ok(error instanceof Error);
  assert.equal(error.message, `nextpnr stopped on an error: ${BEL}`);
  assert.ok(error.cause instanceof WebAssembly.Exception);
  assert.deepEqual(lines, ['Info: Placing..', 'Warning: a warning', 'ERROR: Cell \'x\' has no BEL', `ERROR: ${BEL}`]);
});

test('a WebAssembly exception with no ERROR: line: nextpnr stopped on an error, said; its lines all said', async () => {
  const { lines, error } = await run(fake('Info: Routing..\n', () => { throw wasmException(); }));
  assert.equal(error.message, 'nextpnr stopped on an error');
  assert.deepEqual(lines, ['Info: Routing..']);
});

test('the package\'s Exit: its exit status; any other error as it is; a run that ends: its files, the last line said', async () => {
  const exited = await run(fake(`ERROR: ${BEL}\n`, () => { throw new Exit(1); }));
  assert.equal(exited.error.message, 'nextpnr exited with code 1');
  assert.deepEqual(exited.lines, [`ERROR: ${BEL}`]);
  const other = new TypeError('out of memory');
  assert.equal((await run(fake('Info: x\n', () => { throw other; }))).error, other);
  const ok = await run(fake('Info: a\nInfo: b', () => ({ 'report.json': '{}' })));
  assert.deepEqual(ok.files, { 'report.json': '{}' });
  assert.deepEqual(ok.lines, ['Info: a', 'Info: b']);
});
