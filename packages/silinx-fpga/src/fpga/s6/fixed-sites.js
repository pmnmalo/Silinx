// Silinx - the sites of a Spartan-6 design that are decided before nextpnr places it with Silinx's Map (#4776: nextpnr
// places everything else, since Silinx's own placer, fpga/s6/place.js, was removed), by the rules Silinx's placer had,
// in its words (browser + Node): each I/O buffer with a LOC on its pad (bonded, one port a pad, the I/Os of a bank of one
// VCCO); a global buffer driven by a pad on the BUFGMUX that pad's dedicated clock path reaches (a GCLK pin: a clock
// input without a LOC takes the first free one, of its bank's VCCO), other ones on the free BUFGMUX in order, a clock on
// a pad no dedicated path leaves a warning; every other port without a LOC on the first free bonded pad of its bank's
// VCCO (nextpnr would take an unbonded one for a site cell's I/O buffer, #4950: until its fork keeps them off); each
// BSCAN on the site of its JTAG chain (#3766). nextpnr's own packer (nextpnr's Map, fpga/s6/nextpnr-pack.js packInput)
// places the pads and global buffers itself, on bonded pads.
//
//   fixedSitesS6(phys, sites) -> { fixed: Map instance name -> site name, warnings }   (a PlaceError when one cannot be)
import { PlaceError } from '../place-common.js';
import { vccoOfStandard } from '../device-sites.js';

export { PlaceError };

/** The VCCO of an IOB: its I/O standard's (ISE's default LVCMOS25). */
const vccoOfIob = inst => vccoOfStandard(inst.cons?.iostandard || 'LVCMOS25');

/** The fixed sites of a physical design (fpga/s6/phys.js) on the device's sites (fpga/s6/sites.js): see above. */
export function fixedSitesS6(phys, sites) {
  const { insts } = phys, fixed = new Map(), owner = new Map(), bankV = new Map(), warnings = [];
  const bankOk = (pad, v) => v == null || !bankV.has(pad.bank) || bankV.get(pad.bank) === v;
  const fix = (inst, site) => { owner.set(site, inst.name); fixed.set(inst.name, site); };
  const fixPad = (inst, pad) => { const v = vccoOfIob(inst); if (v != null && !bankV.has(pad.bank)) bankV.set(pad.bank, v); fix(inst, pad.name); };
  for (const inst of insts) {
    if (inst.kind !== 'iob' || !inst.loc) continue;
    const pad = sites.pads.get(inst.loc), v = vccoOfIob(inst);
    if (!pad) throw new PlaceError(`place: ${inst.name}: LOC ${inst.loc} is not a bonded pad of ${sites.part}`);
    if (owner.has(pad.name)) throw new PlaceError(`place: two ports on pad ${pad.name} (${owner.get(pad.name)}, ${inst.name})`);
    if (!bankOk(pad, v)) throw new PlaceError(`place: ${inst.name}: pad ${pad.name} is in bank ${pad.bank}, whose other I/Os need VCCO ${bankV.get(pad.bank)} V, not ${v} V (I/O standards)`);
    fixPad(inst, pad);
  }
  // the global buffers
  const bufgs = insts.filter(i => i.kind === 'bufg');
  if (bufgs.length > sites.bufgs.length) throw new PlaceError(`place: ${bufgs.length} global clock buffers, the ${sites.part} has ${sites.bufgs.length}`);
  const inputOf = i => phys.nets.find(n => n.loads.some(l => l.inst === i && l.pin === 'I0'));
  for (const inst of bufgs) {
    const src = inputOf(insts.indexOf(inst))?.driver;
    const io = src && insts[src.inst].kind === 'iob' ? insts[src.inst] : null;
    if (io && !fixed.has(io.name)) {
      // a clock input without a LOC: a free clock-capable pad whose buffer is free
      const pad = [...sites.pads.values()].find(p => !owner.has(p.name) && bankOk(p, vccoOfIob(io)) && p.bufg.some(b => !owner.has(b)));
      if (pad) fixPad(io, pad);
    }
    const pad = io && fixed.has(io.name) ? sites.pads.get(fixed.get(io.name)) : null;
    let b = pad ? pad.bufg.find(x => !owner.has(x)) : null;
    if (!b) {
      b = sites.bufgs.map(x => x.name).find(x => !owner.has(x));
      if (pad) warnings.push(`${io.name}: the clock enters on pad ${pad.name}, ${pad.bufg.length ? 'whose global buffer is taken' : 'not a clock-capable pin (GCLK)'}: its global buffer ${b} is reached through general routing`);
    }
    fix(inst, b);
  }
  // the other ports without a LOC: the first free bonded pad of their bank's VCCO, in the device's order (#4950)
  for (const inst of insts) {
    if (inst.kind !== 'iob' || fixed.has(inst.name)) continue;
    const pad = [...sites.pads.values()].find(p => !owner.has(p.name) && bankOk(p, vccoOfIob(inst)));
    if (!pad) throw new PlaceError(`place: no free pad for ${inst.name}`);
    fixPad(inst, pad);
  }
  // the JTAG's user access: a BSCAN on the site of its JTAG chain (the site decides the chain: ISE's bitgen sets the
  // bit of the site that holds it, whatever its JTAG_CHAIN)
  const bscans = new Set((sites.bscans || []).map(b => b.name));
  for (const inst of insts.filter(i => i.kind === 'bscan')) {
    const b = `BSCAN_X0Y${(inst.chain ?? 1) - 1}`;
    if (!bscans.has(b)) throw new PlaceError(`place: ${inst.name}: its JTAG_CHAIN ${inst.chain} is not one of the ${sites.part}'s 1 to ${bscans.size}`);
    if (owner.has(b)) throw new PlaceError(`place: two BSCANs on the JTAG chain ${inst.chain} (${owner.get(b)}, ${inst.name})`);
    fix(inst, b);
  }
  return { fixed, warnings };
}
