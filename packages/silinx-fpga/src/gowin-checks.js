// Silinx toolchain - the Gowin's design checks before nextpnr-himbaechel-gowin (#4352): what it does not place, route or keep, said
// by name (it stops on some with no ERROR: line), from Yosys's netlist.
//   - a CLKDIV2: nextpnr places one only as a CLKDIV's only driver (its HCLK placer stops on a serialiser's FCLK, its router on the
//     fabric's clocks; a CLKDIV with other loads, its packer refuses): an error;
//   - TLVDS_IOBUF: not in its chip database's differential buffers (it refuses it): an error;
//   - a differential tristate's enable (TLVDS_TBUF, ELVDS_TBUF, ELVDS_IOBUF's OEN): nextpnr moves it to the P pin's buffer after
//     recording that buffer's own (none, or GND), which gowin_pack reads: the pair drives always. A warning, unless it is tied to 0.

const TRISTATES = new Set(['TLVDS_TBUF', 'ELVDS_TBUF', 'ELVDS_IOBUF']);
// a cell's input pins (the rest of its pins are its outputs)
const OUTPUTS = { CLKDIV2: ['CLKOUT'], CLKDIV: ['CLKOUT'] };
const isOutput = (c, pin) => c.port_directions?.[pin] === 'output' || (OUTPUTS[c.type] || []).includes(pin);

/** The Gowin design's checks before nextpnr (Yosys's JSON netlist, its top): { errors, warnings }, each a line. */
export function gowinChecks(netlistText, top) {
  const mods = JSON.parse(netlistText).modules || {};
  const mod = mods[top] || Object.values(mods).find(m => m.attributes?.top) || {};
  const cells = Object.entries(mod.cells || {});
  const errors = [], warnings = [];
  // a net's loads: [cell's name, cell, pin]
  const loads = new Map();
  for (const [name, c] of cells) {
    for (const [pin, bits] of Object.entries(c.connections || {})) {
      if (isOutput(c, pin)) continue;
      for (const b of bits) if (typeof b === 'number') (loads.get(b) || loads.set(b, []).get(b)).push([name, c, pin]);
    }
  }
  for (const [name, c] of cells) {
    if (c.type === 'CLKDIV2') {
      const out = c.connections?.CLKOUT?.[0], users = (typeof out === 'number' && loads.get(out)) || [];
      const other = users.filter(([, u, pin]) => !(u.type === 'CLKDIV' && pin === 'HCLKIN'));
      if (other.length || users.length > 1) {
        const named = users.slice(0, 4).map(([n, u, pin]) => `${u.type} ${n}'s ${pin}`).join(', ') + (users.length > 4 ? ', …' : '');
        errors.push(`CLKDIV2 ${name}: its CLKOUT drives ${named}: nextpnr-himbaechel-gowin places a CLKDIV2 only as the only driver of a CLKDIV's HCLKIN`);
      }
    } else if (c.type === 'TLVDS_IOBUF') {
      errors.push(`TLVDS_IOBUF ${name}: nextpnr-himbaechel-gowin has no true LVDS bidirectional buffer on this device`);
    } else if (TRISTATES.has(c.type)) {
      const oen = c.connections?.OEN?.[0];
      if (oen !== undefined && oen !== '0') {
        warnings.push(`${c.type} ${name}: its enable (OEN) is not in the bitstream (nextpnr-himbaechel-gowin drops it): the pair always drives.`);
      }
    }
  }
  return { errors, warnings };
}
