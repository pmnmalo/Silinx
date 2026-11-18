// UI: the GateMate's back end in the browser's real flow worker (#2431): web/js/open-flow-worker.js with nextpnr-himbaechel-gatemate
// served by the local server (what the browser's flow sends: nextpnrOwn), a design from HDL to its .bit in memory (gmpack), no
// warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#2431 a design of the GateMate from HDL to its .bit in the flow worker, no warnings', E, async (page) => {
  const r = await page.eval(async () => {
    const { browserOpenStatus, browserSteps, nextpnrBundleUrl, ownBundle } = await import('/js/open-flow-browser.js');
    const { familyProfile } = await import('/core/family-profile.js');
    const device = { family: 'gatemate', part: 'ccgm1a1', package: 'fbga324', speed: '' };
    const st = browserOpenStatus(device);
    const steps = browserSteps(['bitgen'], { family: st.family });
    const root = new URL('/', location.href).href;
    const where = ownBundle(familyProfile('gatemate').openFlow, root);
    const w = new Worker('/js/open-flow-worker.js', { type: 'module' });
    const lines = [], writes = {};
    const done = await new Promise((resolve, reject) => {
      w.onerror = e => reject(new Error(e.message));
      w.onmessage = ({ data }) => {
        if (data.line !== undefined) lines.push(data.line);
        else if (data.write !== undefined) writes[data.write] = data.data;
        else if (data.done) resolve(data.done);
      };
      w.postMessage({ id: 1, spec: { top: 'blinky', part: st.part, device: 'ccgm1a1', pkg: 'fbga324', speed: '', family: 'gatemate', steps, seed: 1 },
        sources: [{ path: 'blinky.v', lang: 'verilog', text: 'module blinky(input clk, output reg led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23]; end\nendmodule\n' }],
        simSources: [], ucf: 'NET "clk" Loc = "IO_SB_A8";\nNET "led" Loc = "IO_EB_B1";\n# create_clock -period 100.000 [get_ports {clk}]\n', ucfName: 'blinky.ccf', files: {}, assets: root,
        yosys: new URL('vendor/yowasp-yosys/gen/bundle.js', root).href, nextpnr: nextpnrBundleUrl(root),
        nextpnrOwn: { family: 'gatemate', where, tools: 'nextpnr-himbaechel-gatemate and gmpack', mb: 4 } });
    });
    w.terminate();
    return { st, steps, where, ok: done.ok, error: done.error, bit: done.report?.bit, fmax: done.report?.par?.fmax, written: Object.keys(writes),
      warnings: lines.filter(l => /WARNING/.test(l)), steplines: lines.filter(l => /^=== SILINX STEP/.test(l)), routed: typeof writes['build/open/routed.cfg'], notes: lines.filter(l => /^NOTE/.test(l)) };
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.st.available, r.st.part], [true, 'ccgm1a1fbga324']);
  assert.match(r.where, /\/vendor\/nextpnr-himbaechel-gatemate\/gen\/bundle\.js$/);
  assert.deepEqual(r.steps, ['synth', 'translate', 'par', 'bitgen']);
  assert.deepEqual(r.steplines, r.steps.map(s => `=== SILINX STEP ${s} ===`));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.routed, 'string');
  assert.deepEqual(r.written.filter(f => /\.(fs|bit|bin)$/.test(f)), ['build/blinky.bit']);
  assert.ok(r.bit.size > 1000, String(r.bit.size));
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.fmax.map(f => [f.clock, f.constraint]), [['clk', 10]]);
});
