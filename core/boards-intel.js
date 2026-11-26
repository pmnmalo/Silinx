// Silinx - the Intel (Altera) FPGAs' boards (#5376, the Intel roadmap's phase 1): Terasic's DE boards used in teaching, the
// DE10-Lite (MAX 10), the DE0-CV, DE1-SoC and DE10-Nano (Cyclone V), the DE0-Nano and DE2-115 (Cyclone IV E). Their pins from
// Terasic's user manuals' tables (each board's source below), cross-checked against Terasic's golden-top / System Builder .qsf
// files: the same pins (the DE2-115's UART_CTS / UART_RTS swapped in its golden top: the manual's kept). Each pin's I/O standard
// as Quartus names it ("3.3-V LVTTL", "2.5 V", "3.3 V Schmitt Trigger"; Quartus's names, the manuals' in any case): the manual's, else the golden top's where the manual
// gives none (the DE0-CV's). The keys are active low (Schmitt-trigger debounced), the seven-segment displays common anode
// (active low), each display a port of its own (hex0..hex5: no multiplexing). Experimental families: their constraints QSF, no
// flow yet (the Silinx toolchain's Cyclone V #5377, Quartus Prime #5378), not programmed from Silinx yet (#5379).
// test/boards-intel.test.js checks every pin against the manuals' tables (test/fixtures/terasic/).

// Terasic DE10-Lite: DE10-Lite User Manual V1.7, October 17, 2022
const DE10_LITE = [
  { name: 'clk', label: '50 MHz oscillator (MAX10_CLK1_50)', pins: ['PIN_P11'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'max10_clk2_50', label: '50 MHz oscillator (MAX10_CLK2_50)', pins: ['PIN_N14'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'adc_clk_10', label: '10 MHz oscillator (ADC_CLK_10)', pins: ['PIN_N5'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '100 ns' } },
  { name: 'btn', label: 'Push buttons KEY[0..1] (active low)', pins: ['PIN_B8', 'PIN_A7'], dir: 'in', iostandard: '3.3 V Schmitt Trigger', group: 'Buttons', extra: { activeLow: true } },
  { name: 'sw', label: 'Slide switches SW[0..9]', pins: ['PIN_C10', 'PIN_C11', 'PIN_D12', 'PIN_C12', 'PIN_A12', 'PIN_B12', 'PIN_A13', 'PIN_A14', 'PIN_B14', 'PIN_F15'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Switches' },
  { name: 'led', label: 'LEDs LEDR[0..9]', pins: ['PIN_A8', 'PIN_A9', 'PIN_A10', 'PIN_B10', 'PIN_D13', 'PIN_C13', 'PIN_E14', 'PIN_D14', 'PIN_A11', 'PIN_B11'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'hex0', label: 'Seven-segment display HEX0: segments HEX0[0..6], decimal point HEX0[7] (active low)', pins: ['PIN_C14', 'PIN_E15', 'PIN_C15', 'PIN_C16', 'PIN_E16', 'PIN_D17', 'PIN_C17', 'PIN_D15'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex1', label: 'Seven-segment display HEX1: segments HEX1[0..6], decimal point HEX1[7] (active low)', pins: ['PIN_C18', 'PIN_D18', 'PIN_E18', 'PIN_B16', 'PIN_A17', 'PIN_A18', 'PIN_B17', 'PIN_A16'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex2', label: 'Seven-segment display HEX2: segments HEX2[0..6], decimal point HEX2[7] (active low)', pins: ['PIN_B20', 'PIN_A20', 'PIN_B19', 'PIN_A21', 'PIN_B21', 'PIN_C22', 'PIN_B22', 'PIN_A19'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex3', label: 'Seven-segment display HEX3: segments HEX3[0..6], decimal point HEX3[7] (active low)', pins: ['PIN_F21', 'PIN_E22', 'PIN_E21', 'PIN_C19', 'PIN_C20', 'PIN_D19', 'PIN_E17', 'PIN_D22'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex4', label: 'Seven-segment display HEX4: segments HEX4[0..6], decimal point HEX4[7] (active low)', pins: ['PIN_F18', 'PIN_E20', 'PIN_E19', 'PIN_J18', 'PIN_H19', 'PIN_F19', 'PIN_F20', 'PIN_F17'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex5', label: 'Seven-segment display HEX5: segments HEX5[0..6], decimal point HEX5[7] (active low)', pins: ['PIN_J20', 'PIN_K20', 'PIN_L18', 'PIN_N18', 'PIN_M20', 'PIN_N19', 'PIN_N20', 'PIN_L19'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'vga_red', label: 'VGA VGA_R[0..3]', pins: ['PIN_AA1', 'PIN_V1', 'PIN_Y2', 'PIN_Y1'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_green', label: 'VGA VGA_G[0..3]', pins: ['PIN_W1', 'PIN_T2', 'PIN_R2', 'PIN_R1'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_blue', label: 'VGA VGA_B[0..3]', pins: ['PIN_P1', 'PIN_T1', 'PIN_P4', 'PIN_N2'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_hsync', label: 'VGA VGA_HS', pins: ['PIN_N3'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_vsync', label: 'VGA VGA_VS', pins: ['PIN_N1'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'gpio', label: 'GPIO header GPIO[0..35]', pins: ['PIN_V10', 'PIN_W10', 'PIN_V9', 'PIN_W9', 'PIN_V8', 'PIN_W8', 'PIN_V7', 'PIN_W7', 'PIN_W6', 'PIN_V5', 'PIN_W5', 'PIN_AA15', 'PIN_AA14', 'PIN_W13', 'PIN_W12', 'PIN_AB13', 'PIN_AB12', 'PIN_Y11', 'PIN_AB11', 'PIN_W11', 'PIN_AB10', 'PIN_AA10', 'PIN_AA9', 'PIN_Y8', 'PIN_AA8', 'PIN_Y7', 'PIN_AA7', 'PIN_Y6', 'PIN_AA6', 'PIN_Y5', 'PIN_AA5', 'PIN_Y4', 'PIN_AB3', 'PIN_Y3', 'PIN_AB2', 'PIN_AA2'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'arduino_io', label: 'Arduino header ARDUINO_IO[0..15]', pins: ['PIN_AB5', 'PIN_AB6', 'PIN_AB7', 'PIN_AB8', 'PIN_AB9', 'PIN_Y10', 'PIN_AA11', 'PIN_AA12', 'PIN_AB17', 'PIN_AA17', 'PIN_AB19', 'PIN_AA19', 'PIN_Y19', 'PIN_AB20', 'PIN_AB21', 'PIN_AA20'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Arduino' },
  { name: 'arduino_reset_n', label: 'Arduino header reset ARDUINO_RESET_N (active low)', pins: ['PIN_F16'], dir: 'in', iostandard: '3.3 V Schmitt Trigger', group: 'Arduino' },
];

// Terasic DE0-CV: DE0-CV User Manual V1.1.2, May 4, 2015
const DE0_CV = [
  { name: 'clk', label: '50 MHz oscillator (CLOCK_50)', pins: ['PIN_M9'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock2_50', label: '50 MHz oscillator (CLOCK2_50)', pins: ['PIN_H13'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock3_50', label: '50 MHz oscillator (CLOCK3_50)', pins: ['PIN_E10'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock4_50', label: '50 MHz oscillator (CLOCK4_50)', pins: ['PIN_V15'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'btn', label: 'Push buttons KEY[0..3] (active low)', pins: ['PIN_U7', 'PIN_W9', 'PIN_M7', 'PIN_M6'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Buttons', extra: { activeLow: true } },
  { name: 'reset_n', label: 'Push button RESET_N (active low)', pins: ['PIN_P22'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Buttons', extra: { activeLow: true } },
  { name: 'sw', label: 'Slide switches SW[0..9]', pins: ['PIN_U13', 'PIN_V13', 'PIN_T13', 'PIN_T12', 'PIN_AA15', 'PIN_AB15', 'PIN_AA14', 'PIN_AA13', 'PIN_AB13', 'PIN_AB12'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Switches' },
  { name: 'led', label: 'LEDs LEDR[0..9]', pins: ['PIN_AA2', 'PIN_AA1', 'PIN_W2', 'PIN_Y3', 'PIN_N2', 'PIN_N1', 'PIN_U2', 'PIN_U1', 'PIN_L2', 'PIN_L1'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'hex0', label: 'Seven-segment display HEX0: segments HEX0[0..6] (active low)', pins: ['PIN_U21', 'PIN_V21', 'PIN_W22', 'PIN_W21', 'PIN_Y22', 'PIN_Y21', 'PIN_AA22'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex1', label: 'Seven-segment display HEX1: segments HEX1[0..6] (active low)', pins: ['PIN_AA20', 'PIN_AB20', 'PIN_AA19', 'PIN_AA18', 'PIN_AB18', 'PIN_AA17', 'PIN_U22'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex2', label: 'Seven-segment display HEX2: segments HEX2[0..6] (active low)', pins: ['PIN_Y19', 'PIN_AB17', 'PIN_AA10', 'PIN_Y14', 'PIN_V14', 'PIN_AB22', 'PIN_AB21'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex3', label: 'Seven-segment display HEX3: segments HEX3[0..6] (active low)', pins: ['PIN_Y16', 'PIN_W16', 'PIN_Y17', 'PIN_V16', 'PIN_U17', 'PIN_V18', 'PIN_V19'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex4', label: 'Seven-segment display HEX4: segments HEX4[0..6] (active low)', pins: ['PIN_U20', 'PIN_Y20', 'PIN_V20', 'PIN_U16', 'PIN_U15', 'PIN_Y15', 'PIN_P9'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex5', label: 'Seven-segment display HEX5: segments HEX5[0..6] (active low)', pins: ['PIN_N9', 'PIN_M8', 'PIN_T14', 'PIN_P14', 'PIN_C1', 'PIN_C2', 'PIN_W19'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'vga_red', label: 'VGA VGA_R[0..3]', pins: ['PIN_A9', 'PIN_B10', 'PIN_C9', 'PIN_A5'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_green', label: 'VGA VGA_G[0..3]', pins: ['PIN_L7', 'PIN_K7', 'PIN_J7', 'PIN_J8'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_blue', label: 'VGA VGA_B[0..3]', pins: ['PIN_B6', 'PIN_B7', 'PIN_A8', 'PIN_A7'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_hsync', label: 'VGA VGA_HS', pins: ['PIN_H8'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_vsync', label: 'VGA VGA_VS', pins: ['PIN_G8'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'gpio_0', label: 'GPIO header GPIO_0[0..35]', pins: ['PIN_N16', 'PIN_B16', 'PIN_M16', 'PIN_C16', 'PIN_D17', 'PIN_K20', 'PIN_K21', 'PIN_K22', 'PIN_M20', 'PIN_M21', 'PIN_N21', 'PIN_R22', 'PIN_R21', 'PIN_T22', 'PIN_N20', 'PIN_N19', 'PIN_M22', 'PIN_P19', 'PIN_L22', 'PIN_P17', 'PIN_P16', 'PIN_M18', 'PIN_L18', 'PIN_L17', 'PIN_L19', 'PIN_K17', 'PIN_K19', 'PIN_P18', 'PIN_R15', 'PIN_R17', 'PIN_R16', 'PIN_T20', 'PIN_T19', 'PIN_T18', 'PIN_T17', 'PIN_T15'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_1', label: 'GPIO header GPIO_1[0..35]', pins: ['PIN_H16', 'PIN_A12', 'PIN_H15', 'PIN_B12', 'PIN_A13', 'PIN_B13', 'PIN_C13', 'PIN_D13', 'PIN_G18', 'PIN_G17', 'PIN_H18', 'PIN_J18', 'PIN_J19', 'PIN_G11', 'PIN_H10', 'PIN_J11', 'PIN_H14', 'PIN_A15', 'PIN_J13', 'PIN_L8', 'PIN_A14', 'PIN_B15', 'PIN_C15', 'PIN_E14', 'PIN_E15', 'PIN_E16', 'PIN_F14', 'PIN_F15', 'PIN_F13', 'PIN_F12', 'PIN_G16', 'PIN_G15', 'PIN_G13', 'PIN_G12', 'PIN_J17', 'PIN_K16'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
];

// Terasic DE1-SoC: DE1-SoC User Manual (rev.F/rev.G Board) V2.0.4, January 28, 2019
const DE1_SOC = [
  { name: 'clk', label: '50 MHz oscillator (CLOCK_50)', pins: ['PIN_AF14'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock2_50', label: '50 MHz oscillator (CLOCK2_50)', pins: ['PIN_AA16'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock3_50', label: '50 MHz oscillator (CLOCK3_50)', pins: ['PIN_Y26'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock4_50', label: '50 MHz oscillator (CLOCK4_50)', pins: ['PIN_K14'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'led', label: 'LEDs LEDR[0..9]', pins: ['PIN_V16', 'PIN_W16', 'PIN_V17', 'PIN_V18', 'PIN_W17', 'PIN_W19', 'PIN_Y19', 'PIN_W20', 'PIN_W21', 'PIN_Y21'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'sw', label: 'Slide switches SW[0..9]', pins: ['PIN_AB12', 'PIN_AC12', 'PIN_AF9', 'PIN_AF10', 'PIN_AD11', 'PIN_AD12', 'PIN_AE11', 'PIN_AC9', 'PIN_AD10', 'PIN_AE12'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Switches' },
  { name: 'btn', label: 'Push buttons KEY[0..3] (active low)', pins: ['PIN_AA14', 'PIN_AA15', 'PIN_W15', 'PIN_Y16'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Buttons', extra: { activeLow: true } },
  { name: 'hex0', label: 'Seven-segment display HEX0: segments HEX0[0..6] (active low)', pins: ['PIN_AE26', 'PIN_AE27', 'PIN_AE28', 'PIN_AG27', 'PIN_AF28', 'PIN_AG28', 'PIN_AH28'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex1', label: 'Seven-segment display HEX1: segments HEX1[0..6] (active low)', pins: ['PIN_AJ29', 'PIN_AH29', 'PIN_AH30', 'PIN_AG30', 'PIN_AF29', 'PIN_AF30', 'PIN_AD27'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex2', label: 'Seven-segment display HEX2: segments HEX2[0..6] (active low)', pins: ['PIN_AB23', 'PIN_AE29', 'PIN_AD29', 'PIN_AC28', 'PIN_AD30', 'PIN_AC29', 'PIN_AC30'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex3', label: 'Seven-segment display HEX3: segments HEX3[0..6] (active low)', pins: ['PIN_AD26', 'PIN_AC27', 'PIN_AD25', 'PIN_AC25', 'PIN_AB28', 'PIN_AB25', 'PIN_AB22'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex4', label: 'Seven-segment display HEX4: segments HEX4[0..6] (active low)', pins: ['PIN_AA24', 'PIN_Y23', 'PIN_Y24', 'PIN_W22', 'PIN_W24', 'PIN_V23', 'PIN_W25'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex5', label: 'Seven-segment display HEX5: segments HEX5[0..6] (active low)', pins: ['PIN_V25', 'PIN_AA28', 'PIN_Y27', 'PIN_AB27', 'PIN_AB26', 'PIN_AA26', 'PIN_AA25'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'vga_red', label: 'VGA VGA_R[0..7]', pins: ['PIN_A13', 'PIN_C13', 'PIN_E13', 'PIN_B12', 'PIN_C12', 'PIN_D12', 'PIN_E12', 'PIN_F13'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_green', label: 'VGA VGA_G[0..7]', pins: ['PIN_J9', 'PIN_J10', 'PIN_H12', 'PIN_G10', 'PIN_G11', 'PIN_G12', 'PIN_F11', 'PIN_E11'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_blue', label: 'VGA VGA_B[0..7]', pins: ['PIN_B13', 'PIN_G13', 'PIN_H13', 'PIN_F14', 'PIN_H14', 'PIN_F15', 'PIN_G15', 'PIN_J14'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_hsync', label: 'VGA VGA_HS', pins: ['PIN_B11'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_vsync', label: 'VGA VGA_VS', pins: ['PIN_D11'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_blank_n', label: 'VGA VGA_BLANK_N', pins: ['PIN_F10'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_sync_n', label: 'VGA VGA_SYNC_N', pins: ['PIN_C10'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_clk', label: 'VGA VGA_CLK', pins: ['PIN_A11'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'gpio_0', label: 'GPIO header GPIO_0[0..35]', pins: ['PIN_AC18', 'PIN_Y17', 'PIN_AD17', 'PIN_Y18', 'PIN_AK16', 'PIN_AK18', 'PIN_AK19', 'PIN_AJ19', 'PIN_AJ17', 'PIN_AJ16', 'PIN_AH18', 'PIN_AH17', 'PIN_AG16', 'PIN_AE16', 'PIN_AF16', 'PIN_AG17', 'PIN_AA18', 'PIN_AA19', 'PIN_AE17', 'PIN_AC20', 'PIN_AH19', 'PIN_AJ20', 'PIN_AH20', 'PIN_AK21', 'PIN_AD19', 'PIN_AD20', 'PIN_AE18', 'PIN_AE19', 'PIN_AF20', 'PIN_AF21', 'PIN_AF19', 'PIN_AG21', 'PIN_AF18', 'PIN_AG20', 'PIN_AG18', 'PIN_AJ21'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_1', label: 'GPIO header GPIO_1[0..35]', pins: ['PIN_AB17', 'PIN_AA21', 'PIN_AB21', 'PIN_AC23', 'PIN_AD24', 'PIN_AE23', 'PIN_AE24', 'PIN_AF25', 'PIN_AF26', 'PIN_AG25', 'PIN_AG26', 'PIN_AH24', 'PIN_AH27', 'PIN_AJ27', 'PIN_AK29', 'PIN_AK28', 'PIN_AK27', 'PIN_AJ26', 'PIN_AK26', 'PIN_AH25', 'PIN_AJ25', 'PIN_AJ24', 'PIN_AK24', 'PIN_AG23', 'PIN_AK23', 'PIN_AH23', 'PIN_AK22', 'PIN_AJ22', 'PIN_AH22', 'PIN_AG22', 'PIN_AF24', 'PIN_AF23', 'PIN_AE22', 'PIN_AD21', 'PIN_AA20', 'PIN_AC22'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
];

// Terasic DE10-Nano: DE10-Nano User Manual (rev. E Hardware) V2.6, August 9, 2023
const DE10_NANO = [
  { name: 'clk', label: '50 MHz oscillator (FPGA_CLK1_50)', pins: ['PIN_V11'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'fpga_clk2_50', label: '50 MHz oscillator (FPGA_CLK2_50)', pins: ['PIN_Y13'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'fpga_clk3_50', label: '50 MHz oscillator (FPGA_CLK3_50, shared with FPGA_CLK1_50)', pins: ['PIN_E11'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'led', label: 'LEDs LED[0..7] (LED[6..7] from Terasic\'s golden top: the manual\'s table lists LED[0..5])', pins: ['PIN_W15', 'PIN_AA24', 'PIN_V16', 'PIN_V15', 'PIN_AF26', 'PIN_AE26', 'PIN_Y16', 'PIN_AA23'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'sw', label: 'Slide switches SW[0..3]', pins: ['PIN_Y24', 'PIN_W24', 'PIN_W21', 'PIN_W20'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Switches' },
  { name: 'btn', label: 'Push buttons KEY[0..1] (active low)', pins: ['PIN_AH17', 'PIN_AH16'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Buttons', extra: { activeLow: true } },
  { name: 'gpio_0', label: 'GPIO header GPIO_0[0..35]', pins: ['PIN_V12', 'PIN_E8', 'PIN_W12', 'PIN_D11', 'PIN_D8', 'PIN_AH13', 'PIN_AF7', 'PIN_AH14', 'PIN_AF4', 'PIN_AH3', 'PIN_AD5', 'PIN_AG14', 'PIN_AE23', 'PIN_AE6', 'PIN_AD23', 'PIN_AE24', 'PIN_D12', 'PIN_AD20', 'PIN_C12', 'PIN_AD17', 'PIN_AC23', 'PIN_AC22', 'PIN_Y19', 'PIN_AB23', 'PIN_AA19', 'PIN_W11', 'PIN_AA18', 'PIN_W14', 'PIN_Y18', 'PIN_Y17', 'PIN_AB25', 'PIN_AB26', 'PIN_Y11', 'PIN_AA26', 'PIN_AA13', 'PIN_AA11'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_1', label: 'GPIO header GPIO_1[0..35]', pins: ['PIN_Y15', 'PIN_AC24', 'PIN_AA15', 'PIN_AD26', 'PIN_AG28', 'PIN_AF28', 'PIN_AE25', 'PIN_AF27', 'PIN_AG26', 'PIN_AH27', 'PIN_AG25', 'PIN_AH26', 'PIN_AH24', 'PIN_AF25', 'PIN_AG23', 'PIN_AF23', 'PIN_AG24', 'PIN_AH22', 'PIN_AH21', 'PIN_AG21', 'PIN_AH23', 'PIN_AA20', 'PIN_AF22', 'PIN_AE22', 'PIN_AG20', 'PIN_AF21', 'PIN_AG19', 'PIN_AH19', 'PIN_AG18', 'PIN_AH18', 'PIN_AF18', 'PIN_AF20', 'PIN_AG15', 'PIN_AE20', 'PIN_AE19', 'PIN_AE17'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'arduino_io', label: 'Arduino header ARDUINO_IO[0..15]', pins: ['PIN_AG13', 'PIN_AF13', 'PIN_AG10', 'PIN_AG9', 'PIN_U14', 'PIN_U13', 'PIN_AG8', 'PIN_AH8', 'PIN_AF17', 'PIN_AE15', 'PIN_AF15', 'PIN_AG16', 'PIN_AH11', 'PIN_AH12', 'PIN_AH9', 'PIN_AG11'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Arduino' },
  { name: 'arduino_reset_n', label: 'Arduino header reset ARDUINO_RESET_N (active low)', pins: ['PIN_AH7'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Arduino' },
];

// Terasic DE0-Nano: DE0-Nano User Manual V2.3
const DE0_NANO = [
  { name: 'clk', label: '50 MHz oscillator (CLOCK_50)', pins: ['PIN_R8'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'btn', label: 'Push buttons KEY[0..1] (active low)', pins: ['PIN_J15', 'PIN_E1'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Buttons', extra: { activeLow: true } },
  { name: 'led', label: 'LEDs LED[0..7]', pins: ['PIN_A15', 'PIN_A13', 'PIN_B13', 'PIN_A11', 'PIN_D1', 'PIN_F3', 'PIN_B1', 'PIN_L3'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'sw', label: 'DIP switches SW[0..3]', pins: ['PIN_M1', 'PIN_T8', 'PIN_B9', 'PIN_M15'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Switches' },
  { name: 'gpio_0', label: 'GPIO header GPIO_0[0..33]', pins: ['PIN_D3', 'PIN_C3', 'PIN_A2', 'PIN_A3', 'PIN_B3', 'PIN_B4', 'PIN_A4', 'PIN_B5', 'PIN_A5', 'PIN_D5', 'PIN_B6', 'PIN_A6', 'PIN_B7', 'PIN_D6', 'PIN_A7', 'PIN_C6', 'PIN_C8', 'PIN_E6', 'PIN_E7', 'PIN_D8', 'PIN_E8', 'PIN_F8', 'PIN_F9', 'PIN_E9', 'PIN_C9', 'PIN_D9', 'PIN_E11', 'PIN_E10', 'PIN_C11', 'PIN_B11', 'PIN_A12', 'PIN_D11', 'PIN_D12', 'PIN_B12'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_0_in', label: 'GPIO header GPIO_0_IN[0..1] (input only)', pins: ['PIN_A8', 'PIN_B8'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_1', label: 'GPIO header GPIO_1[0..33]', pins: ['PIN_F13', 'PIN_T15', 'PIN_T14', 'PIN_T13', 'PIN_R13', 'PIN_T12', 'PIN_R12', 'PIN_T11', 'PIN_T10', 'PIN_R11', 'PIN_P11', 'PIN_R10', 'PIN_N12', 'PIN_P9', 'PIN_N9', 'PIN_N11', 'PIN_L16', 'PIN_K16', 'PIN_R16', 'PIN_L15', 'PIN_P15', 'PIN_P16', 'PIN_R14', 'PIN_N16', 'PIN_N15', 'PIN_P14', 'PIN_L14', 'PIN_N14', 'PIN_M10', 'PIN_L13', 'PIN_J16', 'PIN_K15', 'PIN_J13', 'PIN_J14'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_1_in', label: 'GPIO header GPIO_1_IN[0..1] (input only)', pins: ['PIN_T9', 'PIN_R9'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_2', label: 'GPIO header GPIO_2[0..12]', pins: ['PIN_A14', 'PIN_B16', 'PIN_C14', 'PIN_C16', 'PIN_C15', 'PIN_D16', 'PIN_D15', 'PIN_D14', 'PIN_F15', 'PIN_F16', 'PIN_F14', 'PIN_G16', 'PIN_G15'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
  { name: 'gpio_2_in', label: 'GPIO header GPIO_2_IN[0..2] (input only)', pins: ['PIN_E15', 'PIN_E16', 'PIN_M16'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Headers' },
];

// Terasic DE2-115: DE2-115 User Manual V2.3, 2017
const DE2_115 = [
  { name: 'clk', label: '50 MHz oscillator (CLOCK_50)', pins: ['PIN_Y2'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock2_50', label: '50 MHz oscillator (CLOCK2_50)', pins: ['PIN_AG14'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'clock3_50', label: '50 MHz oscillator (CLOCK3_50)', pins: ['PIN_AG15'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'Clock', extra: { period: '20 ns' } },
  { name: 'sma_clkin', label: 'SMA SMA_CLKIN', pins: ['PIN_AH14'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'SMA' },
  { name: 'sma_clkout', label: 'SMA SMA_CLKOUT', pins: ['PIN_AE23'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'SMA' },
  { name: 'led', label: 'LEDs LEDR[0..17]', pins: ['PIN_G19', 'PIN_F19', 'PIN_E19', 'PIN_F21', 'PIN_F18', 'PIN_E18', 'PIN_J19', 'PIN_H19', 'PIN_J17', 'PIN_G17', 'PIN_J15', 'PIN_H16', 'PIN_J16', 'PIN_H17', 'PIN_F15', 'PIN_G15', 'PIN_G16', 'PIN_H15'], dir: 'out', iostandard: '2.5 V', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'ledg', label: 'Green LEDs LEDG[0..8]', pins: ['PIN_E21', 'PIN_E22', 'PIN_E25', 'PIN_E24', 'PIN_H21', 'PIN_G20', 'PIN_G22', 'PIN_G21', 'PIN_F17'], dir: 'out', iostandard: '2.5 V', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'sw', label: 'Slide switches SW[0..17]', pins: ['PIN_AB28', 'PIN_AC28', 'PIN_AC27', 'PIN_AD27', 'PIN_AB27', 'PIN_AC26', 'PIN_AD26', 'PIN_AB26', 'PIN_AC25', 'PIN_AB25', 'PIN_AC24', 'PIN_AB24', 'PIN_AB23', 'PIN_AA24', 'PIN_AA23', 'PIN_AA22', 'PIN_Y24', 'PIN_Y23'], dir: 'in', iostandard: '2.5 V', group: 'Switches' },
  { name: 'btn', label: 'Push buttons KEY[0..3] (active low)', pins: ['PIN_M23', 'PIN_M21', 'PIN_N21', 'PIN_R24'], dir: 'in', iostandard: '2.5 V', group: 'Buttons', extra: { activeLow: true } },
  { name: 'hex0', label: 'Seven-segment display HEX0: segments HEX0[0..6] (active low)', pins: ['PIN_G18', 'PIN_F22', 'PIN_E17', 'PIN_L26', 'PIN_L25', 'PIN_J22', 'PIN_H22'], dir: 'out', iostandard: '2.5 V', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex1', label: 'Seven-segment display HEX1: segments HEX1[0..6] (active low)', pins: ['PIN_M24', 'PIN_Y22', 'PIN_W21', 'PIN_W22', 'PIN_W25', 'PIN_U23', 'PIN_U24'], dir: 'out', iostandard: '2.5 V', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex2', label: 'Seven-segment display HEX2: segments HEX2[0..6] (active low)', pins: ['PIN_AA25', 'PIN_AA26', 'PIN_Y25', 'PIN_W26', 'PIN_Y26', 'PIN_W27', 'PIN_W28'], dir: 'out', iostandard: '2.5 V', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex3', label: 'Seven-segment display HEX3: segments HEX3[0..6] (active low)', pins: ['PIN_V21', 'PIN_U21', 'PIN_AB20', 'PIN_AA21', 'PIN_AD24', 'PIN_AF23', 'PIN_Y19'], dir: 'out', iostandard: '2.5 V',
    pinIostandards: { PIN_AB20: '3.3-V LVTTL', PIN_AA21: '3.3-V LVTTL', PIN_AD24: '3.3-V LVTTL', PIN_AF23: '3.3-V LVTTL', PIN_Y19: '3.3-V LVTTL' }, group: '7-segment', extra: { activeLow: true } },
  { name: 'hex4', label: 'Seven-segment display HEX4: segments HEX4[0..6] (active low)', pins: ['PIN_AB19', 'PIN_AA19', 'PIN_AG21', 'PIN_AH21', 'PIN_AE19', 'PIN_AF19', 'PIN_AE18'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex5', label: 'Seven-segment display HEX5: segments HEX5[0..6] (active low)', pins: ['PIN_AD18', 'PIN_AC18', 'PIN_AB18', 'PIN_AH19', 'PIN_AG19', 'PIN_AF18', 'PIN_AH18'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex6', label: 'Seven-segment display HEX6: segments HEX6[0..6] (active low)', pins: ['PIN_AA17', 'PIN_AB16', 'PIN_AA16', 'PIN_AB17', 'PIN_AB15', 'PIN_AA15', 'PIN_AC17'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'hex7', label: 'Seven-segment display HEX7: segments HEX7[0..6] (active low)', pins: ['PIN_AD17', 'PIN_AE17', 'PIN_AG17', 'PIN_AH17', 'PIN_AF17', 'PIN_AG18', 'PIN_AA14'], dir: 'out', iostandard: '3.3-V LVTTL', group: '7-segment', extra: { activeLow: true } },
  { name: 'vga_red', label: 'VGA VGA_R[0..7]', pins: ['PIN_E12', 'PIN_E11', 'PIN_D10', 'PIN_F12', 'PIN_G10', 'PIN_J12', 'PIN_H8', 'PIN_H10'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_green', label: 'VGA VGA_G[0..7]', pins: ['PIN_G8', 'PIN_G11', 'PIN_F8', 'PIN_H12', 'PIN_C8', 'PIN_B8', 'PIN_F10', 'PIN_C9'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_blue', label: 'VGA VGA_B[0..7]', pins: ['PIN_B10', 'PIN_A10', 'PIN_C11', 'PIN_B11', 'PIN_A11', 'PIN_C12', 'PIN_D11', 'PIN_D12'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_hsync', label: 'VGA VGA_HS', pins: ['PIN_G13'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_vsync', label: 'VGA VGA_VS', pins: ['PIN_C13'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_blank_n', label: 'VGA VGA_BLANK_N', pins: ['PIN_F11'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_sync_n', label: 'VGA VGA_SYNC_N', pins: ['PIN_C10'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'vga_clk', label: 'VGA VGA_CLK', pins: ['PIN_A12'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'VGA' },
  { name: 'lcd_d', label: 'Character LCD LCD_DATA[0..7]', pins: ['PIN_L3', 'PIN_L1', 'PIN_L2', 'PIN_K7', 'PIN_K1', 'PIN_K2', 'PIN_M3', 'PIN_M5'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'LCD' },
  { name: 'lcd_e', label: 'Character LCD LCD_EN', pins: ['PIN_L4'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LCD' },
  { name: 'lcd_rw', label: 'Character LCD LCD_RW', pins: ['PIN_M1'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LCD' },
  { name: 'lcd_rs', label: 'Character LCD LCD_RS', pins: ['PIN_M2'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LCD' },
  { name: 'lcd_on', label: 'Character LCD LCD_ON', pins: ['PIN_L5'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LCD' },
  { name: 'lcd_blon', label: 'Character LCD LCD_BLON', pins: ['PIN_L6'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'LCD' },
  { name: 'uart_rx', label: 'RS-232 UART_RXD', pins: ['PIN_G12'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'RS-232' },
  { name: 'uart_tx', label: 'RS-232 UART_TXD', pins: ['PIN_G9'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'RS-232' },
  { name: 'uart_cts', label: 'RS-232 UART_CTS', pins: ['PIN_G14'], dir: 'in', iostandard: '3.3-V LVTTL', group: 'RS-232' },
  { name: 'uart_rts', label: 'RS-232 UART_RTS', pins: ['PIN_J13'], dir: 'out', iostandard: '3.3-V LVTTL', group: 'RS-232' },
  { name: 'ps2_clk', label: 'PS/2 PS2_CLK', pins: ['PIN_G6'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'PS/2' },
  { name: 'ps2_data', label: 'PS/2 PS2_DAT', pins: ['PIN_H5'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'PS/2' },
  { name: 'ps2_clk2', label: 'PS/2 PS2_CLK2', pins: ['PIN_G5'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'PS/2' },
  { name: 'ps2_data2', label: 'PS/2 PS2_DAT2', pins: ['PIN_F5'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'PS/2' },
  { name: 'gpio', label: 'GPIO header GPIO[0..35]', pins: ['PIN_AB22', 'PIN_AC15', 'PIN_AB21', 'PIN_Y17', 'PIN_AC21', 'PIN_Y16', 'PIN_AD21', 'PIN_AE16', 'PIN_AD15', 'PIN_AE15', 'PIN_AC19', 'PIN_AF16', 'PIN_AD19', 'PIN_AF15', 'PIN_AF24', 'PIN_AE21', 'PIN_AF25', 'PIN_AC22', 'PIN_AE22', 'PIN_AF21', 'PIN_AF22', 'PIN_AD22', 'PIN_AG25', 'PIN_AD25', 'PIN_AH25', 'PIN_AE25', 'PIN_AG22', 'PIN_AE24', 'PIN_AH22', 'PIN_AF26', 'PIN_AE20', 'PIN_AG23', 'PIN_AF20', 'PIN_AH26', 'PIN_AH23', 'PIN_AG26'], dir: 'inout', iostandard: '3.3-V LVTTL', group: 'Headers' },
];

// (#5379: the FPGA's SRAM loaded by openFPGALoader through the on-board USB-Blaster (an FT245 and a CPLD) or USB-Blaster II (an FX2
// and a MAX II, its firmware Quartus's blaster_6810.hex), its cable usb-blaster or usb-blasterII; -b its board where openFPGALoader
// names it (de10lite, de1Soc, de10nano, de0nano), the DE0-CV and the DE2-115 by their cable alone. The file: Quartus's .sof made a
// .svf for the MAX 10 (its SRAM is loaded only as an SVF), a .rbf for the Cyclone IV and V. Not tried on a board yet.)
const programmer = (usb, board, ext) => ({ preferred: 'openFPGALoader', tools: { openFPGALoader: { ...(board ? { board } : {}), cable: usb === 'USB-Blaster II' ? 'usb-blasterII' : 'usb-blaster',
  onboard: true, verified: false, usb, note: `The on-board ${usb} (JTAG): the ${ext} loaded into the FPGA's SRAM, until the board is powered off.` } } });

export const INTEL_BOARDS = [
  {
    id: 'de10-lite', name: 'Terasic DE10-Lite', vendor: 'Terasic', device: { family: 'max10', part: '10m50da', package: 'f484', speed: 'c7g' },
    jtagChain: [{ name: '10m50da', role: 'fpga' }],
    flash: { type: 'internal', part: 'MAX 10 configuration flash memory (CFM)', sizeMbit: null, xcf: false, verified: false, note: 'The MAX 10\'s own configuration flash (a .pof): written by Quartus Prime\'s programmer, not from Silinx yet.' },
    programmer: programmer('USB-Blaster', 'de10lite', '.svf'),
    source: 'DE10-Lite User Manual V1.7, October 17, 2022 (the FPGA 10M50DAF484C7G)', sourceUrl: 'https://www.terasic.com.tw/attachment/archive/1021/DE10-Lite_User_Manual.pdf',
    resources: DE10_LITE,
  },
  {
    id: 'de0-cv', name: 'Terasic DE0-CV', vendor: 'Terasic', device: { family: 'cyclone5', part: '5ceba4', package: 'f23', speed: 'c7' },
    jtagChain: [{ name: '5ceba4', role: 'fpga' }],
    flash: { type: 'spi', part: 'EPCS64', sizeMbit: 64, xcf: false, verified: false, note: 'The serial configuration device the FPGA loads at power-up (AS mode): written by Quartus Prime\'s programmer, not from Silinx yet.' },
    programmer: programmer('USB-Blaster', null, '.rbf'),
    source: 'DE0-CV User Manual V1.1.2, May 4, 2015 (the FPGA 5CEBA4F23C7N)', sourceUrl: 'https://www.terasic.com.tw/cgi-bin/page/archive_download.pl?Language=English&No=921&FID=f23586755af207055fa8a4c6aaac3198',
    resources: DE0_CV,
  },
  {
    id: 'de1-soc', name: 'Terasic DE1-SoC', vendor: 'Terasic', device: { family: 'cyclone5', part: '5csema5', package: 'f31', speed: 'c6' },
    deviceNotes: 'The FPGA side only: the HPS (its ARM cores) and its pins are not set up. Its JTAG chain has the HPS before the FPGA.',
    jtagChain: [{ name: '5csema5', role: 'fpga' }],
    flash: { type: 'spi', part: 'EPCS128', sizeMbit: 128, xcf: false, verified: false, note: 'The serial configuration device (EPCS128 on the rev. F/G boards, EPCQ256 on the first ones): written by Quartus Prime\'s programmer, not from Silinx yet.' },
    programmer: programmer('USB-Blaster II', 'de1Soc', '.rbf'),
    source: 'DE1-SoC User Manual (rev.F/rev.G Board) V2.0.4, January 28, 2019 (the FPGA 5CSEMA5F31C6N)', sourceUrl: 'https://www.terasic.com.tw/cgi-bin/page/archive_download.pl?Language=English&No=836&FID=3a3708b0790bb9c721f94909c5ac96d6',
    resources: DE1_SOC,
  },
  {
    id: 'de10-nano', name: 'Terasic DE10-Nano', vendor: 'Terasic', device: { family: 'cyclone5', part: '5cseba6', package: 'u23', speed: 'i7' },
    deviceNotes: 'The FPGA side only: the HPS (its ARM cores) and its pins are not set up. Its JTAG chain has the HPS before the FPGA.',
    jtagChain: [{ name: '5cseba6', role: 'fpga' }],
    flash: { type: 'spi', part: 'EPCS64', sizeMbit: 64, xcf: false, verified: false, note: 'The serial configuration device: written by Quartus Prime\'s programmer, not from Silinx yet.' },
    programmer: programmer('USB-Blaster II', 'de10nano', '.rbf'),
    source: 'DE10-Nano User Manual (rev. E Hardware) V2.6, August 9, 2023 (the FPGA 5CSEBA6U23I7)', sourceUrl: 'https://www.terasic.com.tw/cgi-bin/page/archive_download.pl?Language=English&No=1046&FID=ee6469cf97af76af334e2b2f82f93268',
    resources: DE10_NANO,
  },
  {
    id: 'de0-nano', name: 'Terasic DE0-Nano', vendor: 'Terasic', device: { family: 'cyclone4e', part: 'ep4ce22', package: 'f17', speed: 'c6' },
    deviceNotes: 'The DIP switches SW[0..3] read high when down (the manual\'s Table 3-3), the other way round from the other DE boards.',
    jtagChain: [{ name: 'ep4ce22', role: 'fpga' }],
    flash: { type: 'spi', part: 'EPCS64', sizeMbit: 64, xcf: false, verified: false, note: 'The serial configuration device (AS mode, a .jic through JTAG): written by Quartus Prime\'s programmer, not from Silinx yet.' },
    programmer: programmer('USB-Blaster', 'de0nano', '.rbf'),
    source: 'DE0-Nano User Manual V2.3 (the FPGA EP4CE22F17C6N)', sourceUrl: 'https://www.terasic.com.tw/attachment/archive/593/DE0_Nano_User_Manual.pdf',
    resources: DE0_NANO,
  },
  {
    id: 'de2-115', name: 'Terasic DE2-115', vendor: 'Terasic', device: { family: 'cyclone4e', part: 'ep4ce115', package: 'f29', speed: 'c7' },
    deviceNotes: 'The I/O standards are the jumpers\' defaults, as Terasic\'s golden top: JP7 at 2.5 V (the switches, the keys, HEX0..HEX3[1]), JP6 at 3.3 V (the GPIO header, HEX3[2]..HEX7). UART_CTS and UART_RTS as the manual\'s Table 4-18 (the golden top swaps them).',
    jtagChain: [{ name: 'ep4ce115', role: 'fpga' }],
    flash: { type: 'spi', part: 'EPCS64', sizeMbit: 64, xcf: false, verified: false, note: 'The serial configuration device (AS mode): written by Quartus Prime\'s programmer, not from Silinx yet.' },
    programmer: programmer('USB-Blaster', null, '.rbf'),
    source: 'DE2-115 User Manual V2.3, 2017 (the FPGA EP4CE115F29C7N)', sourceUrl: 'https://www.terasic.com.tw/attachment/archive/502/DE2_115_User_manual.pdf',
    resources: DE2_115,
  },
];
