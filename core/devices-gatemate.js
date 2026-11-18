// Silinx - the GateMate parts (#2431's family in the device database): Cologne Chip's CCGM1A1 and CCGM1A2, the parts whose chip
// database YoWASP's nextpnr-himbaechel-gatemate has (packages/silinx-fpga/src/open-flow-gatemate.js GATEMATE_PARTS).
//
// Sources: Cologne Chip's GateMate FPGA data sheet (DS1001) and nextpnr-himbaechel-gatemate's chip databases, which count the
// same: the CPEs (each a LUT tree of two 4-input LUTs' halves, CPE_LT, and two flip-flops / latches, CPE_FF), the 40 Kbit
// block RAMs (two RAM_HALFs each), the PLLs, and the GPIOs of the FBGA324 (162, on either part); the CCGM1A2 two CCGM1A1 dies in one package. No
// speed grades: the speed is a mode of the part's supply (fpga_mode, nextpnr's default the speed one).

const pkgs = o => Object.fromEntries(Object.entries(o).map(([k, userIo]) => [k, { userIo }]));

function gatemate(part, dies) {
  const cpes = 20480 * dies, brams = 32 * dies;
  return {
    part, family: 'gatemate', logicCells: cpes, slices: cpes, luts: 2 * cpes, ffs: 2 * cpes, distRamBits: 0,   // (a slice: a CPE)
    brams, bramSize: 40, bramBits: brams * 40 * 1024, dsp: 0, multipliers: 0, dcms: 0, plls: 4 * dies,
    maxUserIo: 162, packages: pkgs({ fbga324: 162 }), speeds: [],   // (the A2's second die's GPIOs, nextpnr's 324, not bonded)
  };
}

export const GATEMATE_FAMILY = {
  id: 'gatemate', name: 'GateMate', displayName: 'GateMate', datasheet: 'DS1001', webpack: false,
  speeds: {}, ioStandards: [],
  note: 'Implemented by the open toolchain only (Yosys, nextpnr-himbaechel-gatemate and gmpack: Project Peppercorn); its constraints are CCF.',
};

export const GATEMATE_PACKAGES = { fbga324: '324-ball Fine-pitch BGA (FBGA324, 15 x 15 mm)' };

export const GATEMATE_DEVICES = [gatemate('ccgm1a1', 1), gatemate('ccgm1a2', 2)];
