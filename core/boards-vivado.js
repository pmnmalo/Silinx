// Silinx - the boards of Vivado ML Standard's other 7-series families (#3895), AMD Vivado's (their flow: server/vivado.js), their
// pins from Digilent's master XDCs (the commit the Basys 3's are from):
// - the Digilent Arty S7 (-50: XC7S50, -25: XC7S25; CSGA324), a Spartan-7: its 12 MHz oscillator (the 100 MHz one is on bank 34,
//   at 1.35 V for the DDR3: SSTL135), 4 LEDs, 2 RGB LEDs, 4 switches (SW3 on bank 34 too: left out), 4 buttons, the USB-UART;
// - the Digilent Zybo Z7 (-20: XC7Z020, -10: XC7Z010; CLG400), a Zynq-7000, its programmable logic only (no processing system
//   set up): its 125 MHz clock (from the Ethernet PHY), 4 LEDs, an RGB LED (LED6; LED5 the Z7-20's only: left out), 4
//   switches, 4 buttons; its USB-UART is the PS's (MIO), none in the PL.
// No seven-segment display, VGA or 8 LEDs: the examples' ports with no pin on the board on its Pmods (group 'Headers', #3709: an
// input with a pull-down), as Vivado's write_bitstream refuses a port with no pin (UCIO-1). The Zybo Z7's Pmod JB is the
// Z7-20's only: left out.

const DIGILENT_XDC = 'https://github.com/Digilent/digilent-xdc/blob/c8644a9fe31cc803789643124545d56b3bef4600/';
const io = (name, label, pins, dir, group, extra) => ({ name, label, pins, dir, iostandard: 'LVCMOS33', group, ...(extra ? { extra } : {}) });
const pmod = (name, pins) => { const n = name.toUpperCase(); return io(name, `Pmod ${n} (${n}1-4, ${n}7-10)`, pins, 'inout', 'Headers'); };

const ARTY_S7 = {
  id: 'arty-s7',
  name: 'Digilent Arty S7',
  vendor: 'Digilent',
  device: { family: 'spartan7', part: 'xc7s50', package: 'csga324', speed: '-1' },
  variants: [
    { id: '50', label: 'Arty S7-50 (XC7S50)', device: { family: 'spartan7', part: 'xc7s50', package: 'csga324', speed: '-1' }, default: true },
    { id: '25', label: 'Arty S7-25 (XC7S25)', device: { family: 'spartan7', part: 'xc7s25', package: 'csga324', speed: '-1' } },
  ],
  deviceNotes: 'The Arty S7 (Rev. E). The 100 MHz oscillator and SW3 are on bank 34, at 1.35 V for the DDR3 (SSTL135): not resources here.',
  jtagChain: [{ name: 'xc7s50', role: 'fpga' }],
  flash: { type: 'spi', part: 'Quad-SPI flash, 128 Mbit', sizeMbit: 128, xcf: false, verified: false, note: 'The quad-SPI flash the FPGA loads at power-up (JP2 on SPI); written by Vivado\'s hardware manager or openFPGALoader.' },
  programmer: {
    preferred: 'openFPGALoader',
    tools: {
      openFPGALoader: { board: 'arty_s7_50', usb: 'FT2232H', webusb: 'digilent', onboard: true, verified: false, note: 'The on-board USB-JTAG (FTDI FT2232HQ); openFPGALoader\'s arty_s7_25 for the S7-25.' },
    },
  },
  source: 'Digilent Arty-S7-50-Master.xdc (Rev. E; the Arty-S7-25-Master.xdc\'s pins are the same)',
  sourceUrl: `${DIGILENT_XDC}Arty-S7-50-Master.xdc`,
  xdc: { config: { CONFIG_VOLTAGE: '3.3', CFGBVS: 'VCCO', 'BITSTREAM.GENERAL.COMPRESS': 'TRUE', 'BITSTREAM.CONFIG.CONFIGRATE': '50', 'BITSTREAM.CONFIG.SPI_BUSWIDTH': '4', CONFIG_MODE: 'SPIx4' } },
  resources: [
    io('clk', '12 MHz oscillator (CLK12MHZ)', ['F14'], 'in', 'Clock', { period: '83.333 ns' }),
    io('led', 'LEDs LD2..LD5', ['E18', 'F13', 'E13', 'H15'], 'out', 'LEDs', { activeHigh: true }),
    io('led0_rgb', 'RGB LED LD0 (red, green, blue)', ['J15', 'G17', 'F15'], 'out', 'LEDs', { activeHigh: true }),
    io('led1_rgb', 'RGB LED LD1 (red, green, blue)', ['E15', 'F18', 'E14'], 'out', 'LEDs', { activeHigh: true }),
    io('sw', 'Slide switches SW0..SW2 (SW3 on bank 34, at 1.35 V: left out)', ['H14', 'H18', 'G18'], 'in', 'Switches'),
    io('btn', 'Push buttons BTN0..BTN3', ['G15', 'K16', 'J16', 'H13'], 'in', 'Buttons', { activeHigh: true }),
    io('uart_rx', 'USB-UART RXD (uart_txd_in, into the FPGA)', ['V12'], 'in', 'USB-UART'),
    io('uart_tx', 'USB-UART TXD (uart_rxd_out, from the FPGA)', ['R12'], 'out', 'USB-UART'),
    pmod('ja', ['L17', 'L18', 'M14', 'N14', 'M16', 'M17', 'M18', 'N18']),
    pmod('jb', ['P17', 'P18', 'R18', 'T18', 'P14', 'P15', 'N15', 'P16']),
    pmod('jc', ['U15', 'V16', 'U17', 'U18', 'U16', 'P13', 'R13', 'V14']),
    pmod('jd', ['V15', 'U12', 'V13', 'T12', 'T13', 'R11', 'T11', 'U11']),
  ],
};

const ZYBO_Z7 = {
  id: 'zybo-z7',
  name: 'Digilent Zybo Z7',
  vendor: 'Digilent',
  device: { family: 'zynq', part: 'xc7z020', package: 'clg400', speed: '-1' },
  variants: [
    { id: '20', label: 'Zybo Z7-20 (XC7Z020)', device: { family: 'zynq', part: 'xc7z020', package: 'clg400', speed: '-1' }, default: true },
    { id: '10', label: 'Zybo Z7-10 (XC7Z010)', device: { family: 'zynq', part: 'xc7z010', package: 'clg400', speed: '-1' } },
  ],
  deviceNotes: 'The Zybo Z7 (Rev. B), its programmable logic only: no processing system set up (the PS7, its block design, a boot image). Its USB-UART and its QSPI flash are the PS\'s.',
  jtagChain: [{ name: 'xc7z020', role: 'fpga' }],
  flash: { type: 'spi', part: 'Quad-SPI flash, 128 Mbit (the processing system\'s)', sizeMbit: 128, xcf: false, verified: false, note: 'The PS boots from it: a boot image (an FSBL and the .bit, bootgen), not written from Silinx. The .bit is loaded over JTAG.' },
  programmer: {
    preferred: 'openFPGALoader',
    tools: {
      openFPGALoader: { board: 'zybo_z7_20', usb: 'FT2232H', webusb: 'digilent', onboard: true, verified: false, note: 'The on-board USB-JTAG (FTDI FT2232HQ): the .bit into the PL; openFPGALoader\'s zybo_z7_10 for the Z7-10.' },
    },
  },
  source: 'Digilent Zybo-Z7-Master.xdc (Rev. B, the Z7-20 and the Z7-10)',
  sourceUrl: `${DIGILENT_XDC}Zybo-Z7-Master.xdc`,
  // (a Zynq's PL: none of an FPGA's configuration properties, server/vivado.js)
  xdc: { config: {} },
  resources: [
    io('clk', '125 MHz clock (sysclk, from the Ethernet PHY)', ['K17'], 'in', 'Clock', { period: '8 ns' }),
    io('led', 'LEDs LD0..LD3', ['M14', 'M15', 'G14', 'D18'], 'out', 'LEDs', { activeHigh: true }),
    io('led6_rgb', 'RGB LED LD6 (red, green, blue)', ['V16', 'F17', 'M17'], 'out', 'LEDs', { activeHigh: true }),
    io('sw', 'Slide switches SW0..SW3', ['G15', 'P15', 'W13', 'T16'], 'in', 'Switches'),
    io('btn', 'Push buttons BTN0..BTN3', ['K18', 'P16', 'K19', 'Y16'], 'in', 'Buttons', { activeHigh: true }),
    pmod('ja', ['N15', 'L14', 'K16', 'K14', 'N16', 'L15', 'J16', 'J14']),
    pmod('jc', ['V15', 'W15', 'T11', 'T10', 'W14', 'Y14', 'T12', 'U12']),
    pmod('jd', ['T14', 'T15', 'P14', 'R14', 'U14', 'U15', 'V17', 'V18']),
    pmod('je', ['V12', 'W16', 'J15', 'H15', 'V13', 'U17', 'T17', 'Y17']),
  ],
};

export const VIVADO_BOARDS = [ARTY_S7, ZYBO_Z7];
