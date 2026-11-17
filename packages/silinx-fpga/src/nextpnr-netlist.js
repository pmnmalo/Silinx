// Silinx toolchain - the Place & Route of another netlist on a nextpnr family (#2299: the iCE40's, ECP5's and Gowin's simulation
// models, of the design synthesized with the test bench's generics): the family's own Place & Route (its mount's par step,
// the same constraints, device and seed) on a report and a log of their own, nothing written; resolves nextpnr's routed design
// (its --write JSON), as the Xilinx families' placeRouteNetlist resolves theirs (open-flow-backends.js).

/** placeRouteNetlist(text, top) of a family's mount (mount(ctx) its function, ctx the run's): resolves the routed JSON. */
export function otherNetlist(mount, ctx) {
  return async (text, top) => {
    let routed = null;
    const o = mount({ ...ctx, top, netlistText: () => text, report: { files: {} }, log: () => {}, io: { ...ctx.io, write: (name) => name },
      setRouted: (t) => { routed = t; } });
    await o.steps.par();
    return routed;
  };
}
