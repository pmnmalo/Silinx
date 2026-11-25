// Silinx - a System project's FPGA nodes' constraints files read on the server (#5581, core/system-constraints.js): their
// texts, for the check, the runs and the builds, which read each node's pins from them.
import * as P from './projects.js';
import { constraintsPaths } from '../core/system-constraints.js';

/** The project `name`'s FPGA nodes' constraints files' texts ({ path: text }, those it has: `files` its paths). */
export async function constraintsTexts(name, sys, files) {
  const out = {};
  for (const f of constraintsPaths(sys).filter(f => files.includes(f))) {
    const t = await P.readFile(name, f).catch(() => null);
    if (t != null) out[f] = t;
  }
  return out;
}
