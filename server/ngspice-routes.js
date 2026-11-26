// The route of ngspice (#5386) for the interface of the server editions: a circuit's netlist (core/circuit-spice.js's,
// written by its Try it) run by the server's ngspice (server/ngspice.js: downloaded on first use, in a worker thread of its
// own). Answers its result, its errors and what the server said (its download). A netlist of Silinx's own only: no
// control block, no file read (.control, .include, .lib), no shell command.
import { runNgspice } from './ngspice.js';

const REFUSED = /^\s*(?:\.(?:control|endc|include|inc|lib)\b|shell\b)/im;

export function registerNgspiceRoutes(api, { wrap, projects: P }) {
  api.post('/ngspice', wrap(async req => {
    const netlist = req.body?.netlist;
    if (typeof netlist !== 'string' || !netlist.trim()) throw new P.HttpError(400, 'netlist: a SPICE netlist');
    if (REFUSED.test(netlist)) throw new P.HttpError(400, 'netlist: a circuit\'s own (no .control, .include, .lib nor shell)');
    const said = [];
    const r = await runNgspice(netlist, { log: line => said.push(line) });
    return { ...r, said };
  }));
}
