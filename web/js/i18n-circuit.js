// Portuguese strings of the digital circuit editor (web/js/circuit-editor.js, #3897; merged into the dictionary of i18n.js).
export const CIRCUIT_PT = {
  // New Source, the Design pane
  'Circuit': 'Circuito',
  // toolbar
  'Wire': 'Fio', '↺ Reset': '↺ Recomeçar', '〰 Waveforms': '〰 Formas de onda',
  'View the waveforms of this Try it in the simulator (SSim): its inputs as you changed them, the logic probes\' nets first': 'Ver as formas de onda desta experiência no simulador (SSim): as entradas como as mudou, primeiro as redes das sondas lógicas',
  'Draw a wire: click its start, its bends, then its end on a pin or a hole (double click or Esc: end it there)': 'Desenhar um fio: clique no início, nas dobras e no fim, num pino ou num furo (duplo clique ou Esc: acaba aí)',
  'Turn the selected part a quarter clockwise (R)': 'Rodar a peça selecionada um quarto de volta no sentido dos ponteiros do relógio (R)',
  'Check the circuit: short circuits, unpowered ICs, floating inputs, parts and wires that join nothing': 'Verificar o circuito: curto-circuitos, CIs sem alimentação, entradas no ar, peças e fios que não ligam nada',
  'Try it: click a switch to flip it, press a button to hold it; the LEDs and each pin\'s level show the circuit working': 'Experimentar: clique num interruptor para o mudar, carregue num botão para o manter premido; os LEDs e o nível de cada pino mostram o circuito a funcionar',
  'Start the simulation again from time 0': 'Recomeçar a simulação no instante 0',
  'Moving or turning a part: its wires\' ends follow its pins and holes, or stay where they are (a breadboard always carries the parts on it)': 'Ao mover ou rodar uma peça: as pontas dos fios seguem os seus pinos e furos, ou ficam onde estão (uma placa de ensaio leva sempre as peças que tem)',
  // side panel
  'Parts': 'Peças', 'Breadboards': 'Placas de ensaio', 'Power': 'Alimentação', 'Inputs': 'Entradas', 'Outputs': 'Saídas', 'Gates (74LS)': 'Portas (74LS)',
  'Label': 'Etiqueta', 'Colour': 'Cor', 'HDL language': 'Linguagem HDL', 'Gates (4000)': 'Portas (4000)', 'MSI (74LS)': 'MSI (74LS)', 'Sequential (74LS, 4000)': 'Sequenciais (74LS, 4000)',
  'On': 'Ligado', 'Levers on': 'Alavancas ligadas', 'Frequency (Hz)': 'Frequência (Hz)',
  'red': 'vermelho', 'green': 'verde', 'yellow': 'amarelo', 'blue': 'azul', 'white': 'branco', 'black': 'preto', 'orange': 'laranja', 'purple': 'roxo',
};
// the parts' titles (core/circuit-parts.js, core/circuit-ics.js)
const TITLE = { 'Half breadboard': 'Meia placa de ensaio', 'Full breadboard (its rails split in the middle)': 'Placa de ensaio inteira (as linhas de alimentação cortadas ao meio)',
  'Power supply (+5 V, GND)': 'Fonte de alimentação (+5 V, GND)', 'Logic switch': 'Interruptor lógico',
  'Push button (momentary, normally open)': 'Botão de pressão (momentâneo, normalmente aberto)', 'Slide switch (SPDT)': 'Comutador deslizante (SPDT)',
  'DIP switch (4)': 'Interruptor DIP (4)', 'DIP switch (8)': 'Interruptor DIP (8)', 'Clock source': 'Fonte de relógio',
  'Pull-up (a weak 1)': 'Pull-up (um 1 fraco)', 'Pull-down (a weak 0)': 'Pull-down (um 0 fraco)', LED: 'LED',
  '7-segment display, common cathode': 'Mostrador de 7 segmentos, cátodo comum', '7-segment display, common anode': 'Mostrador de 7 segmentos, ânodo comum',
  'LED bar (10)': 'Barra de LEDs (10)', 'Logic probe': 'Sonda lógica', 'Hex inverter': 'Seis inversores', 'Hex Schmitt-trigger inverter': 'Seis inversores Schmitt-trigger',
  'Hex inverter, open collector': 'Seis inversores, coletor aberto', 'Hex inverter buffer, open collector': 'Seis inversores buffer, coletor aberto',
  // the MSI ICs (#3900, core/circuit-msi.js)
  'BCD to 7-segment decoder/driver, open collector, active low': 'Descodificador BCD para 7 segmentos, coletor aberto, ativo a 0',
  'BCD to 7-segment decoder/driver, active high': 'Descodificador BCD para 7 segmentos, ativo a 1', '3-to-8 line decoder': 'Descodificador de 3 para 8 linhas',
  'Dual 2-to-4 line decoder': 'Dois descodificadores de 2 para 4 linhas', '8-to-1 line multiplexer': 'Multiplexador de 8 para 1 linha',
  'Dual 4-to-1 line multiplexer': 'Dois multiplexadores de 4 para 1 linha', 'Quad 2-to-1 line multiplexer': 'Quatro multiplexadores de 2 para 1 linha',
  '4-bit binary full adder': 'Somador binário completo de 4 bits', '4-bit magnitude comparator': 'Comparador de magnitude de 4 bits',
  // the sequential ICs (#3900, core/circuit-seq.js)
  'Dual D flip-flop, preset and clear (rising edge)': 'Dois flip-flops D, preset e clear (flanco ascendente)',
  'Dual J-K flip-flop, preset and clear (falling edge)': 'Dois flip-flops J-K, preset e clear (flanco descendente)',
  'Decade counter (divide by 2 and by 5, falling edges)': 'Contador de década (divide por 2 e por 5, flancos descendentes)',
  '4-bit binary counter (divide by 2 and by 8, falling edges)': 'Contador binário de 4 bits (divide por 2 e por 8, flancos descendentes)',
  'Synchronous 4-bit binary counter, asynchronous clear': 'Contador binário síncrono de 4 bits, clear assíncrono',
  'Synchronous 4-bit binary counter, synchronous clear': 'Contador binário síncrono de 4 bits, clear síncrono',
  'Synchronous 4-bit up/down binary counter': 'Contador binário síncrono crescente/decrescente de 4 bits',
  'Synchronous 4-bit up/down binary counter, dual clock': 'Contador binário síncrono crescente/decrescente de 4 bits, dois relógios',
  '8-bit serial in, parallel out shift register': 'Registo de deslocamento de 8 bits, entrada série, saída paralela',
  '8-bit parallel in, serial out shift register': 'Registo de deslocamento de 8 bits, entrada paralela, saída série',
  '4-bit bidirectional universal shift register': 'Registo de deslocamento universal bidirecional de 4 bits',
  '8-bit shift register with output latches, 3-state': 'Registo de deslocamento de 8 bits com latches de saída, 3 estados',
  'BCD to 7-segment latch/decoder/driver, active high': 'Latch/descodificador BCD para 7 segmentos, ativo a 1',
  'Decade counter/divider with 10 decoded outputs': 'Contador/divisor de década com 10 saídas descodificadas' };
const COUNT = { Quad: ['Quatro portas', 2], Triple: ['Três portas', 3], Dual: ['Duas portas', 4] };
const GATES = '(?:Quad 2|Triple 3|Dual 4|8)-input (?:NAND|AND|OR|NOR|XOR)(?:, open collector)?';
const TITLES = `(?:${[...Object.keys(TITLE).map((t) => t.replace(/[()+]/g, '\\$&')), GATES].join('|')})`;
const title = (t) => TITLE[t] ?? t.replace(/^(?:(Quad|Triple|Dual) \d|8)-input (\w+)(, open collector)?$/, (m, n, g, oc) => `${n ? COUNT[n][0] : 'Uma porta'} ${g} de ${n ? COUNT[n][1] : 8} entradas${oc ? ', coletor aberto' : ''}`);
export const CIRCUIT_PT_PATTERNS = [
  // the status line's counts (#2763)
  [/^(\d+) IC\(s\) · (\d+) input\(s\) · (\d+) display\(s\) · (\d+) wire\(s\)$/, '$1 CI(s) · $2 entrada(s) · $3 mostrador(es) · $4 fio(s)'],
  // the library's parts and ICs, their tips, the selection's title, a pinout's
  [new RegExp(`^(\\d{4,5}) (${TITLES})$`), (m, n, t) => `${n} ${title(t)}`],
  [new RegExp(`^(${TITLES}): click it, then the drawing \\(Esc: done\\)$`), (m, t) => `${title(t)}: clique nela e depois no desenho (Esc: terminar)`],
  [new RegExp(`^([A-Za-z]\\w*): (${TITLES})$`), (m, id, t) => `${id}: ${title(t)}`],
  [new RegExp(`^(${TITLES}): pinout$`), (m, t) => `${title(t)}: pinos`],
  [new RegExp(`^(${TITLES})$`), (m, t) => title(t)],
  [/^((?:SN74LS|CD)\d{2,4}B?): pinout$/, '$1: pinos'], [/^Typical delay (\d+) ns(, open collector)?$/, (m, n, oc) => `Atraso típico de ${n} ns${oc ? ', coletor aberto' : ''}`],
  [/^Input ([A-Za-z]\w*(?:_…)?) of the HDL$/, 'Entrada $1 do HDL'], [/^Output ([A-Za-z]\w*(?:_…)?) of the HDL$/, 'Saída $1 do HDL'],
  [/^Wire ([A-Za-z]\w*)$/, 'Fio $1'], [/^Lever (\d+)$/, 'Alavanca $1'],
];
