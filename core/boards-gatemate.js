// Silinx - the GateMate's board (#2431): Cologne Chip's GateMate FPGA Evaluation Board (the CCGM1A1 in its FBGA324), its pins
// from LiteX's platform of the board (litex-hub/litex-boards colognechip_gatemate_evb.py, after Cologne Chip's data sheet of
// the board, DS1003 v3.1). The board's own resources: the 10 MHz oscillator, 8 LEDs and a button (active low, as the platform
// names them, user_led_n and user_btn_n), its Pmod connectors PMODA and PMODB. The examples' LEDs, switches and buttons on
// its headers (a breadboard, as the iCEBreaker's Pmods, #2517), their seven-segment display on the Pmods, vga's VGA on the
// same pins (gatemate-evb-vga); none verified on a board. Its .bit from gmpack; not programmed from Silinx (openFPGALoader
// -b gatemate_evb_jtag loads it: no openFPGALoader in the browser, nor a GateMate's JTAG in Silinx).

const SOURCE = 'LiteX\'s colognechip_gatemate_evb.py (litex-hub/litex-boards), after Cologne Chip\'s DS1003 (GateMate FPGA Evaluation Board, v3.1)';
const SOURCE_URL = 'https://github.com/litex-hub/litex-boards/blob/master/litex_boards/platforms/colognechip_gatemate_evb.py';
const device = { family: 'gatemate', part: 'ccgm1a1', package: 'fbga324', speed: '' };

const OWN = [
  { name: 'clk', label: '10 MHz oscillator (clk10)', pins: ['IO_SB_A8'], dir: 'in', group: 'Clock', extra: { period: '100 ns' } },
  { name: 'led_n', label: 'LEDs D1..D8 (user_led_n, active low)', pins: ['IO_EB_B1', 'IO_EB_B2', 'IO_EB_B3', 'IO_EB_B4', 'IO_EB_B5', 'IO_EB_B6', 'IO_EB_B7', 'IO_EB_B8'],
    dir: 'out', group: 'LEDs', extra: { activeLow: true } },
  { name: 'btn_n', label: 'Button SW3 (user_btn_n, active low)', pins: ['IO_EB_B0'], dir: 'in', group: 'Buttons', extra: { activeLow: true } },
];
const header = (what, where, dir = 'out') => ({ dir, verified: false, label: `${what} on ${where} (a breadboard)` });
// the examples' inputs and LEDs on the headers of the banks NA and SA, and a UART (an adapter's) on SA's
const BREADBOARD = [
  { ...header('LEDs LD0..LD7 (active high)', 'the header of bank NA (IO_NA_A0..A7)'), name: 'led', pins: ['IO_NA_A0', 'IO_NA_A1', 'IO_NA_A2', 'IO_NA_A3', 'IO_NA_A4', 'IO_NA_A5', 'IO_NA_A6', 'IO_NA_A7'],
    group: 'LEDs', extra: { activeHigh: true } },
  { ...header('Switches SW0..SW7', 'the header of bank SA (IO_SA_A0..A7)', 'in'), name: 'sw', pins: ['IO_SA_A0', 'IO_SA_A1', 'IO_SA_A2', 'IO_SA_A3', 'IO_SA_A4', 'IO_SA_A5', 'IO_SA_A6', 'IO_SA_A7'], group: 'Switches' },
  { ...header('Push buttons BTN0..BTN3 (active high)', 'the header of bank SA (IO_SA_B0..B3)', 'in'), name: 'btn', pins: ['IO_SA_B0', 'IO_SA_B1', 'IO_SA_B2', 'IO_SA_B3'],
    group: 'Buttons', extra: { activeHigh: true } },
  { ...header('UART RX (from a USB-UART adapter)', 'the header of bank SA (IO_SA_B4)', 'in'), name: 'rx', pins: ['IO_SA_B4'], group: 'UART' },
  { ...header('UART TX (to a USB-UART adapter)', 'the header of bank SA (IO_SA_B5)'), name: 'tx', pins: ['IO_SA_B5'], group: 'UART' },
];
const BOARD = {
  vendor: 'Cologne Chip', device,
  flash: { type: 'spi', sizeMbit: null, xcf: false, verified: false, note: 'Not written from Silinx: openFPGALoader -b gatemate_evb_spi writes the .bit into it.' },
  jtagChain: [{ name: 'ccgm1a1', role: 'fpga' }],
  programmer: {
    preferred: 'openFPGALoader',
    tools: { openFPGALoader: { board: 'gatemate_evb_jtag', onboard: true, verified: false, usb: 'FT2232H', note: 'The on-board FT2232H (JTAG): the .bit loaded into the FPGA\'s SRAM, until the board is powered off. Not from Silinx.' } },
  },
  source: SOURCE, sourceUrl: SOURCE_URL,
};

export const GATEMATE_BOARDS = [
  {
    id: 'gatemate-evb', name: 'Cologne Chip GateMate FPGA Evaluation Board', ...BOARD,
    resources: [
      ...OWN, ...BREADBOARD,
      { ...header('7-segment cathodes CA..CG (active low)', 'PMODA (IO_NB_A0..A3, IO_NB_B0..B2)'), name: 'seg', pins: ['IO_NB_A0', 'IO_NB_A1', 'IO_NB_A2', 'IO_NB_A3', 'IO_NB_B0', 'IO_NB_B1', 'IO_NB_B2'],
        group: '7-segment', extra: { activeLow: true } },
      { ...header('7-segment decimal point (active low)', 'PMODA (IO_NB_B3)'), name: 'dp', pins: ['IO_NB_B3'], group: '7-segment', extra: { activeLow: true } },
      { ...header('7-segment anodes AN0..AN3 (active low)', 'PMODB (IO_NB_A4..A7)'), name: 'an', pins: ['IO_NB_A4', 'IO_NB_A5', 'IO_NB_A6', 'IO_NB_A7'], group: '7-segment', extra: { activeLow: true } },
    ],
  },
  {
    // the board with a VGA connector on its Pmods (3/3/2 bits of colour through resistors): the display's pins
    id: 'gatemate-evb-vga', name: 'Cologne Chip GateMate FPGA Evaluation Board + VGA', ...BOARD,
    resources: [
      ...OWN, ...BREADBOARD,
      { ...header('VGA red R0..R2', 'PMODA (IO_NB_A0..A2)'), name: 'vga_red', pins: ['IO_NB_A0', 'IO_NB_A1', 'IO_NB_A2'], group: 'VGA' },
      { ...header('VGA green G0..G2', 'PMODA (IO_NB_A3, IO_NB_B0..B1)'), name: 'vga_green', pins: ['IO_NB_A3', 'IO_NB_B0', 'IO_NB_B1'], group: 'VGA' },
      { ...header('VGA blue B0..B1', 'PMODA (IO_NB_B2..B3)'), name: 'vga_blue', pins: ['IO_NB_B2', 'IO_NB_B3'], group: 'VGA' },
      { ...header('VGA HSYNC', 'PMODB (IO_NB_A4)'), name: 'vga_hsync', pins: ['IO_NB_A4'], group: 'VGA' },
      { ...header('VGA VSYNC', 'PMODB (IO_NB_A5)'), name: 'vga_vsync', pins: ['IO_NB_A5'], group: 'VGA' },
    ],
  },
];
