// Silinx - the Intel (Altera) parts (#5376's families in the device database): the FPGAs of Terasic's DE boards
// (core/boards-intel.js), named as Quartus names them (10M50DA, EP4CE22, 5CEBA4) in lower case, their package and speed grade
// as Quartus writes them after the part (F484, C7G; F17, C6): 10M50DAF484C7G, EP4CE22F17C6, 5CEBA4F23C7.
//
// Sources: Intel's MAX 10 FPGA Device Overview (Table 4, the maximum resource counts; Table 6, the packages' user I/O) and its
// General Purpose I/O User Guide (Table 3, the I/O standards); the Cyclone IV Device Handbook, volume 1 (Table 1-1, the
// resources; Table 1-3, the packages' user I/O; Table 6-3, the I/O standards); the Cyclone V Device Overview (CV-51001, the
// E's and SE's maximum resource counts and package plans) and its handbook, volume 1 (Table 1, the M10K blocks; Table 32, the
// FPGA's I/O standards). An LE is a 4-input LUT and a register (MAX 10, Cyclone IV: the registers one per LE, the M9K blocks
// their Kbit / 9); a Cyclone V's ALM two adaptive LUTs and four registers, its LEs the overview's equivalent (49K, 85K, 110K;
// the 10M50's its 50K). The JTAG IDCODEs from the handbooks' fields. The I/O standards as Quartus's IO_STANDARD assignments
// write them (a QSF's, qsf.js).

const part = (name, family, o) => ({
  part: name, family, logicCells: o.les, slices: o.alms || o.les, luts: o.alms ? 2 * o.alms : o.les, ffs: o.ffs, distRamBits: (o.mlabKbit || 0) * 1024,
  brams: o.blocks, bramSize: o.blockKbit, bramBits: o.blocks * o.blockKbit * 1024, dsp: o.dsp || o.mult, multipliers: o.mult, dspType: o.dspType, dcms: 0, plls: o.plls,
  maxUserIo: o.io, packages: { [o.pkg]: { userIo: o.io } }, speeds: [o.speed], idcode: o.idcode, ...(o.extra || {}),
});

// (the single-ended standards, then the differential ones Silinx's boards may name)
const IO_33 = ['3.3-V LVTTL', '3.3-V LVCMOS', '3.0-V LVTTL', '3.0-V LVCMOS', '2.5 V', '1.8 V', '1.5 V', '1.2 V', '3.0-V PCI'];
export const INTEL_IO_STANDARDS = {
  max10: [...IO_33, '1.0 V', '3.3 V Schmitt Trigger', '2.5 V Schmitt Trigger', '1.8 V Schmitt Trigger', '1.5 V Schmitt Trigger', 'LVDS'],
  cyclone4e: [...IO_33, '3.0-V PCI-X', 'LVDS'],
  cyclone5: [...IO_33, '3.0-V PCI-X', 'LVDS'],
};
const QUARTUS = 'No implementation flow yet: its boards and its constraints (QSF; the clocks\' SDC) only. ';
const note = n => `${QUARTUS}${n}`;

export const INTEL_FAMILIES = [
  { id: 'max10', name: 'MAX 10', displayName: 'MAX 10', datasheet: 'M10-OVERVIEW', webpack: false, experimental: true,
    speeds: { c7g: 'C7: commercial, speed grade 7 (G: RoHS)' }, ioStandards: INTEL_IO_STANDARDS.max10,
    note: note('Quartus Prime implements it (#5378); configured from its own flash.') },
  { id: 'cyclone4e', name: 'Cyclone IV E', displayName: 'Cyclone IV E', datasheet: 'CYIV-51001', webpack: false, experimental: true,
    speeds: { c6: 'C6: commercial, speed grade 6 (the fastest)', c7: 'C7: commercial, speed grade 7' }, ioStandards: INTEL_IO_STANDARDS.cyclone4e,
    note: note('Quartus Prime implements it (#5378).') },
  { id: 'cyclone5', name: 'Cyclone V', displayName: 'Cyclone V', datasheet: 'CV-51001', webpack: false, experimental: true,
    speeds: { c6: 'C6: commercial, speed grade 6 (the fastest)', c7: 'C7: commercial, speed grade 7', i7: 'I7: industrial, speed grade 7' }, ioStandards: INTEL_IO_STANDARDS.cyclone5,
    note: note('The Silinx toolchain\'s flow (Yosys, nextpnr-mistral, #5377) and Quartus Prime (#5378) to come. The SE parts\' HPS (the ARM cores) not set up.') },
];

export const INTEL_PACKAGES = {
  f484: '484-pin FineLine BGA (FBGA), 23 mm, 1.0 mm pitch', f23: '484-pin FineLine BGA (FBGA), 23 mm', f31: '896-pin FineLine BGA (FBGA), 31 mm',
  u23: '672-pin Ultra FineLine BGA (UBGA), 23 mm', f17: '256-pin FineLine BGA (FBGA), 17 mm, 1.0 mm pitch', f29: '780-pin FineLine BGA (FBGA), 29 mm, 1.0 mm pitch',
};

export const INTEL_DEVICES = [
  // the DE10-Lite's: dual supply, its ADCs and its flash (DA)
  part('10m50da', 'max10', { les: 50000, ffs: 50000, blocks: 182, blockKbit: 9, mult: 144, dspType: 'MULT18X18', plls: 4, pkg: 'f484', io: 360, speed: 'c7g', idcode: 0x031050DD,
    extra: { adcs: 2, userFlashKbit: 5888 } }),
  // the DE0-Nano's and the DE2-115's
  part('ep4ce22', 'cyclone4e', { les: 22320, ffs: 22320, blocks: 66, blockKbit: 9, mult: 66, dspType: 'MULT18X18', plls: 4, pkg: 'f17', io: 153, speed: 'c6', idcode: 0x020F30DD }),
  part('ep4ce115', 'cyclone4e', { les: 114480, ffs: 114480, blocks: 432, blockKbit: 9, mult: 266, dspType: 'MULT18X18', plls: 4, pkg: 'f29', io: 528, speed: 'c7', idcode: 0x020F70DD }),
  // the DE0-CV's (E), the DE1-SoC's and the DE10-Nano's (SE: its HPS's I/O not counted); a DSP block two 18x18 multipliers
  part('5ceba4', 'cyclone5', { les: 49000, alms: 18480, ffs: 73920, mlabKbit: 303, blocks: 308, blockKbit: 10, mult: 132, dsp: 66, dspType: 'DSP (27x27)', plls: 4, pkg: 'f23', io: 224, speed: 'c7', idcode: 0x02B050DD }),
  part('5csema5', 'cyclone5', { les: 85000, alms: 32070, ffs: 128280, mlabKbit: 480, blocks: 397, blockKbit: 10, mult: 174, dsp: 87, dspType: 'DSP (27x27)', plls: 6, pkg: 'f31', io: 288, speed: 'c6', idcode: 0x02D120DD }),
  part('5cseba6', 'cyclone5', { les: 110000, alms: 41910, ffs: 167640, mlabKbit: 621, blocks: 553, blockKbit: 10, mult: 224, dsp: 112, dspType: 'DSP (27x27)', plls: 6, pkg: 'u23', io: 145, speed: 'i7', idcode: 0x02D020DD }),
];
