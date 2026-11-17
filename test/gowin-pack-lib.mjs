// The Gowin primitives' bitstream tests' harness (#4333): a design of test/fixtures/gowin-pack/designs.mjs built by the flow on
// the Tang Nano 9K to its .fs, then checked: the primitive's cells in the routed design, the flow's warnings exactly, the routed
// design and the .fs against Apicula 0.32's (apicula-0.32.json, primitives: their SHA-256, Apicula's gowin_pack run on that
// routed design).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFlow, nextpnrGowinNode, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { loadChipdb } from '../packages/silinx-fpga/src/fpga/gowin/chipdb.js';
import { installedPackageFile } from '../packages/silinx-fpga/src/nextpnr-gowin-node.js';
import { apyculaDatabase } from '../packages/silinx-fpga/src/fpga/gowin/gowin-files.js';
import { gowinResourcePart } from '../packages/silinx-fpga/src/nextpnr-gowin-io.js';

export const REF = JSON.parse(fs.readFileSync(new URL('./fixtures/gowin-pack/apicula-0.32.json', import.meta.url), 'utf8')).primitives;
export const sha = b => crypto.createHash('sha256').update(b).digest('hex');
/** The GW1N-9C's chip database, as gowin_pack reads it. */
export const database = async () => loadChipdb(await apyculaDatabase(i => installedPackageFile('@yowasp/nextpnr-himbaechel-gowin', gowinResourcePart(i)), 'GW1N-9C'));

const gowin = nextpnrGowinNode();
/** A design built to its .fs: { r, log, files }. */
export async function build(name, d) {
  const log = [], files = {};
  const io = { log: l => log.push(l), sources: () => [{ path: `${name}.v`, lang: 'verilog', text: d.text }], ucf: d.cst, ucfName: `${name}.cst`,
    yosys: yosysNode, nextpnr: { gowin }, write: (n, x) => { files[n] = x; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {} };
  const r = await runFlow({ top: name, family: 'gowin', device: 'gw1nr-9c', pkg: 'qn88', speed: '-6', steps: ['synth', 'translate', 'par', 'bitgen'] }, io);
  return { r, log, files };
}

// a cell's type; an I/O buffer's the MIPI or I3C mode, or the differential type, nextpnr gives it
const MODES = ['MIPI_OBUF', 'MIPI_IBUF', 'I3C_IOBUF'];
const typeOf = c => MODES.find(m => m in c.parameters) ?? c.parameters.DIFF_TYPE ?? c.type;
/** The routed design's cells of the given types, counted. */
export function cellCounts(routed, types) {
  const n = Object.fromEntries(types.map(t => [t, 0]));
  for (const c of Object.values(JSON.parse(routed).modules.top.cells)) if (typeOf(c) in n) n[typeOf(c)]++;
  return n;
}

/** A design built and checked against Apicula's .fs, byte for byte. */
export async function checkDesign(name, d) {
  const { r, log, files } = await build(name, d);
  assert.ok(r.ok, r.error);
  const routed = files['open/routed.json'];
  assert.deepEqual(cellCounts(routed, Object.keys(d.cells)), d.cells);
  assert.deepEqual(log.filter(l => /warning/i.test(l)), d.warnings || []);
  assert.equal(sha(routed), REF[name].routed, `${name}: the routed design is not the reference's`);
  const fsText = files[`${name}.fs`];
  assert.equal(fsText.length, REF[name].fsBytes);
  assert.equal(sha(fsText), REF[name].fs, `${name}: the .fs is not Apicula's`);
}
