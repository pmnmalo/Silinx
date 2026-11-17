// Silinx - the Verilog of the iCE40's, ECP5's and Gowin's simulation models (#2299): Yosys's write_verilog of a netlist
// (the synthesis's, or nextpnr's routed design, its --write JSON) made into a model the test bench instantiates: the
// generics the test bench gives the top declared as its parameters, each I/O cell's pad on a net of its own.
//   - the parameters: the model is synthesized with the test bench's generics (core/flow-models.js), which its generic map
//     gives it again: the netlist's module declares them;
//   - the global buffers (SB_GB): left out, their output nets their input's: with no delays the clock through one more cell than
//     an input pad's signal reached the flip-flops a delta after it, which then loaded what the test bench changed with the
//     edge (the iCE40's clock example: its reset switch);
//   - the pads: a place & route netlist connects its I/O cells' pads (SB_IO's PACKAGE_PIN, TRELLIS_IO's B, IOBUF's IO) to
//     the top's ports and their bits, and an inout connected so loses the input's value (#4360): each pad on a net of its
//     own, assigned from its input port (or bit) or onto its output port.
//
// Isomorphic ES module (browser + Node), no DOM.

const text = (v) => (typeof v === 'string' ? v : new TextDecoder().decode(v));

/** The netlist's module (its first) with `generics` ({ name: value }) declared as its parameters. */
export function withParameters(verilog, generics = {}) {
  const gens = Object.entries(generics);
  if (!gens.length) return verilog;
  return verilog.replace(/^(module [^;]*;\n)/m, `$1${gens.map(([k, v]) => `  parameter ${k} = ${v};\n`).join('')}`);
}

const PAD_PINS = /\.(PACKAGE_PIN|PACKAGEPIN|B|IO)\((\\?[A-Za-z_][\w$.]*)\s*(?:\[(\d+)\]\s*)?\)/g;

/** The netlist with each pad connected to an input or output port (not an inout), or to a bit of one, on a scalar net of its
 *  own. */
export function padNets(verilog) {
  const dirs = new Map();
  for (const m of verilog.matchAll(/^\s*(input|output|inout)\s+(?:\[[^\]]*\]\s*)?([A-Za-z_][\w$]*)\s*;/gm)) dirs.set(m[2], m[1]);
  const added = new Map();
  const body = verilog.replace(PAD_PINS, (all, pin, name, i) => {
    const dir = dirs.get(name);
    if (dir !== 'input' && dir !== 'output') return all;
    const bit = i === undefined ? name : `${name}[${i}]`, w = `\\${bit}$pad `;
    added.set(w, dir === 'input' ? `  assign ${w}= ${bit};` : `  assign ${bit} = ${w};`);
    return `.${pin}(${w})`;
  });
  if (!added.size) return verilog;
  const decls = [...added.keys()].map((w) => `  wire ${w};`).join('\n'), assigns = [...added.values()].join('\n');
  return body.replace(/^endmodule\b/m, `${decls}\n${assigns}\nendmodule`);
}

// a global buffer's instance (Yosys's write_verilog: its pins one a line), its nets (an escaped name ends with its space)
const GB = /^ {2}SB_GB (\S+) \(\n {4}\.GLOBAL_BUFFER_OUTPUT\((\\\S+ |[A-Za-z_][\w$]*(?:\[\d+\])?)\),\n {4}\.USER_SIGNAL_TO_GLOBAL_BUFFER\((\\\S+ |[A-Za-z_][\w$]*(?:\[\d+\])?)\)\n {2}\);\n/gm;
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The netlist with its global buffers (SB_GB) left out, their output nets their input's (but in their declarations). */
export function globalBuffers(verilog) {
  const alias = [];
  let v = verilog.replace(GB, (all, name, o, i) => { alias.push([o, i]); return ''; });
  for (const [o, i] of alias) {
    const re = o.startsWith('\\') ? new RegExp(escapeRe(o), 'g') : new RegExp(`(?<![\\w$\\\\])${escapeRe(o)}(?![\\w$])`, 'g');
    v = v.replace(re, (m, at, str) => (/^\s*wire\b/.test(str.slice(str.lastIndexOf('\n', at) + 1, at)) ? m : (o.startsWith('\\') && !i.endsWith(' ') ? `${i} ` : i)));
  }
  return v;
}

/** The Verilog of nextpnr's routed design (its --write JSON): Yosys's read_json and write_verilog (run: io.yosys), its module
 *  (nextpnr's `top`) named `name`, the design's top. */
export async function routedVerilog(routedJson, run, name = 'top') {
  // (a cell named as a net, which nextpnr allows and Yosys does not, #2299: the cell renamed)
  const j = JSON.parse(text(routedJson));
  for (const m of Object.values(j.modules || {})) {
    const nets = new Set(Object.keys(m.netnames || {}));
    m.cells = Object.fromEntries(Object.entries(m.cells || {}).map(([k, c]) => [nets.has(k) ? `${k}$cell` : k, c]));
  }
  const out = await run(['-q', '-p', 'read_json routed.json; write_verilog -noattr routed.v'], { 'routed.json': JSON.stringify(j) });
  return text(out['routed.v']).replace(/^module top\(/m, `module ${name}(`);
}
