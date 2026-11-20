// Silinx - a placement's error (the Spartan-6's fixed sites, fpga/s6/fixed-sites.js: its LOCs, its BSCANs' chains). The
// placers' random numbers and crossing-count correction went with the last of them (#2137, #4776) (browser + Node).

// (hint: what to change, printed after the error by the flow; open-flow-core.js)
export class PlaceError extends Error {
  constructor(message, hint) { super(message); if (hint !== undefined) this.hint = hint; }
}
