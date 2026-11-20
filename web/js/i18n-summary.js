// Portuguese texts of the Design Summary's values (web/js/summary.js, core/summary-utilization.js, #4518): the product's
// version, the utilization's rows (the resources' names kept as the reports', the sentence around them translated), the
// timing's rows; merged into web/js/i18n.js.

// the flows of the Product Version row
const FLOW_PT = { 'Silinx toolchain, no ISE': 'toolchain Silinx, sem ISE', 'AMD Vivado 2025.2 flow': 'fluxo do AMD Vivado 2025.2', 'Xilinx ISE 14.7 flow': 'fluxo do Xilinx ISE 14.7' };

// the words of the utilization's rows (ISE's MAP report's, XST's, the Silinx toolchain's synthesis's) around the resources' names
const NOUN_PT = {
  'Slice Flip Flops': 'Flip Flops de Slice', '4 input LUTs': 'LUTs de 4 entradas', 'occupied Slices': 'Slices ocupadas', 'bonded IOBs': 'IOBs ligados a pinos',
  'Slice LUTs': 'LUTs de Slice', 'Slice Registers': 'Registos de Slice', latches: 'latches', 'F5-F8 multiplexers': 'multiplexadores F5-F8',
  'carry cells': 'células de transporte', 'shift registers': 'registos de deslocamento', 'distributed RAMs': 'RAMs distribuídas',
  'flip-flops': 'flip-flops', IOs: 'E/S', IOBs: 'IOBs', 'global buffers': 'buffers globais', 'Slices containing only related logic': 'Slices só com lógica relacionada',
  'Slices containing unrelated logic': 'Slices com lógica não relacionada',
};

// a constraint's text: the Silinx toolchain's PERIOD, nextpnr's clock (the tools' own syntax, ISE's, Vivado's, kept)
const constraintPt = c => c.replace(/^PERIOD (\S+) ns on (.+)$/, 'PERIOD $1 ns em $2').replace(/^(\S+) at (\S+) MHz \((\S+) ns\)$/, '$1 a $2 MHz ($3 ns)');

export const SUMMARY_PT = {
  'LUTs as feed-throughs (nextpnr)': 'LUTs como passagens (nextpnr)',
};

export const SUMMARY_PT_PATTERNS = [
  [/^(\S+ \S+) \((Silinx toolchain, no ISE|AMD Vivado 2025\.2 flow|Xilinx ISE 14\.7 flow)\)$/, (m, v, f) => `${v} (${FLOW_PT[f]})`],
  [/^(\S+) ns \(maximum frequency (\S+) MHz\)$/, '$1 ns (frequência máxima $2 MHz)'],
  [/^(.+) — (met|(\d+) errors), (no path between flip-flops to time|(\S+) ns)$/, (m, c, met, n, path, ns) =>
    `${constraintPt(c)} — ${n ? `${n} erros` : 'cumprida'}, ${ns ? `${ns} ns` : 'nenhum caminho entre flip-flops a temporizar'}`],
  [/^clock (\S+)$/, 'relógio $1'],
  [/^Not met \((\d+) errors, score (\d+)\)$/, 'Não cumpridas ($1 erros, pontuação $2)'],
  [/^(\d+) block RAM\(s\), in the utilization above$/, '$1 RAM(s) de bloco, na utilização acima'],
  // (no colon: a wizard's "Number of states (N): a whole number…" is its own pattern's, these being tried first, #4829)
  [/^(Total )?Number of ([^:]+)$/, (m, total, noun) => `${total ? 'Número total de' : 'Número de'} ${NOUN_PT[noun] || noun}`],
];
