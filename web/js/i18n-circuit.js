// Portuguese strings of the digital circuit editor (web/js/circuit-editor.js, #3897; merged into the dictionary of i18n.js).
export const CIRCUIT_PT = {
  // New Source, the Design pane
  'Circuit': 'Circuito', 'Digital Electronic Circuit': 'Circuito Eletrónico Digital',
  // its schematic in the Design pane (#4069)
  'Generated from the circuit': 'Gerado a partir do circuito', 'Generated from the circuit, in its HDL logic form': 'Gerado a partir do circuito, na sua forma da lógica do HDL',
  // the Digital Electronic Circuit Wizard (#4061, core/circuit-templates.js)
  'Digital Electronic Circuit Wizard': 'Assistente de Circuito Eletrónico Digital', 'Circuit (module) name:': 'Nome do circuito (módulo):',
  'The wizard creates a digital electronic circuit from a typical assembly (breadboards, their supply, switches and LEDs), ready for you to place the chips and wire them.': 'O assistente cria um circuito eletrónico digital a partir de uma montagem típica (placas de ensaio, a sua alimentação, interruptores e LEDs), pronto para colocar os chips e ligá-los.',
  'The wizard creates a digital electronic circuit from a typical assembly (breadboards, their supply, switches and LEDs), ready for you to place the chips and wire them; its HDL is generated from it.': 'O assistente cria um circuito eletrónico digital a partir de uma montagem típica (placas de ensaio, a sua alimentação, interruptores e LEDs), pronto para colocar os chips e ligá-los; o seu HDL é gerado a partir dele.',
  'Breadboards and a supply': 'Placas de ensaio e uma fonte', 'Breadboards (N):': 'Placas de ensaio (N):', 'Size:': 'Tamanho:', 'Half (30 columns)': 'Meia (30 colunas)', 'Full (63 columns)': 'Inteira (63 colunas)',
  'N breadboards one under the other, the power supply on the first one\'s top rails; on every board the + rails joined and the − rails joined, and each board\'s rails to the next one\'s.': 'N placas de ensaio umas por baixo das outras, a fonte de alimentação nas linhas de cima da primeira; em cada placa as linhas + ligadas e as linhas − ligadas, e as linhas de cada placa às da seguinte.',
  'Switches and LEDs': 'Interruptores e LEDs', 'Switches (N):': 'Interruptores (N):', 'LEDs (M):': 'LEDs (M):',
  'A half breadboard and its supply, N logic switches in row a (their columns the inputs sw[0]…) and M LEDs in row h, their cathodes on the − rail (their anodes\' columns the outputs led[0]…): the chips go in between.': 'Meia placa de ensaio e a sua fonte, N interruptores lógicos na fila a (as suas colunas as entradas sw[0]…) e M LEDs na fila h, os cátodos na linha − (as colunas dos ânodos as saídas led[0]…): os chips vão no meio.',
  'Nothing, not even a breadboard: place your own parts.': 'Nada, nem sequer uma placa de ensaio: coloque as suas peças.',
  // toolbar
  'Wires and language': 'Fios e linguagem', 'HDL Language': 'Linguagem HDL', 'Preferred Language': 'Linguagem Preferida',
  'The project\'s Preferred Language (Design Properties): the drawing\'s HDL follows it': 'A Linguagem Preferida do projeto (Propriedades do Projeto): o HDL do desenho acompanha-a',
  'The drawing\'s HDL in VHDL, whatever the project\'s Preferred Language': 'O HDL do desenho em VHDL, seja qual for a Linguagem Preferida do projeto',
  'The drawing\'s HDL in Verilog, whatever the project\'s Preferred Language': 'O HDL do desenho em Verilog, seja qual for a Linguagem Preferida do projeto',
  'Wire': 'Fio', 'Show inside': 'Mostrar o interior', 'Wires': 'Fios',
  'Show what is inside the parts: the gates of each IC and its pins\' names, the strips of holes joined in each breadboard': 'Mostrar o interior das peças: as portas de cada CI e os nomes dos seus pinos, as tiras de furos ligados de cada placa de ensaio',
  // the ⋮ menu's Wires (#4080; its labels the schematic's, i18n-schematic.js)
  'Each wire a straight line from point to point': 'Cada fio uma linha reta de ponto a ponto', 'Each wire of horizontal and vertical segments': 'Cada fio de segmentos horizontais e verticais',
  'Each wire a smooth curve through its bends, as a jumper wire': 'Cada fio uma curva suave pelas suas dobras, como um fio de ligação',
  'Stop trying it out and go back to editing the circuit (Esc)': 'Parar de experimentar e voltar a editar o circuito (Esc)',
  'Draw a wire: click its start, its bends, then its end on a pin or a hole (double click or Esc: end it there)': 'Desenhar um fio: clique no início, nas dobras e no fim, num pino ou num furo (duplo clique ou Esc: acaba aí)',
  'Turn the selected part a quarter clockwise (R)': 'Rodar a peça selecionada um quarto de volta no sentido dos ponteiros do relógio (R)',
  'Check the circuit: short circuits, unpowered ICs, floating inputs, parts and wires that join nothing': 'Verificar o circuito: curto-circuitos, CIs sem alimentação, entradas no ar, peças e fios que não ligam nada',
  'Try it: click a switch to flip it, press a button to hold it; the LEDs and each pin\'s level show the circuit working': 'Experimentar: clique num interruptor para o mudar, carregue num botão para o manter premido; os LEDs e o nível de cada pino mostram o circuito a funcionar',
  'Start the simulation again from time 0': 'Recomeçar a simulação no instante 0',
  'Moving or turning a part: its wires\' ends follow its pins and holes, or stay where they are (a breadboard always carries the parts on it)': 'Ao mover ou rodar uma peça: as pontas dos fios seguem os seus pinos e furos, ou ficam onde estão (uma placa de ensaio leva sempre as peças que tem)',
  // side panel
  'Parts': 'Peças', 'Search parts…': 'Procurar peças…', '☰ Parts': '☰ Peças', 'Show / hide the parts panel': 'Mostrar / esconder o painel das peças',
  'Collapse the Parts panel': 'Recolher o painel das peças', 'Expand the Parts panel': 'Expandir o painel das peças', 'Breadboards': 'Placas de ensaio', 'Power': 'Alimentação', 'Inputs': 'Entradas', 'Outputs': 'Saídas', 'Gates (74LS)': 'Portas (74LS)',
  'Label': 'Etiqueta', 'Colour': 'Cor', 'Gates (4000)': 'Portas (4000)', 'MSI (74LS)': 'MSI (74LS)', 'Sequential (74LS, 4000)': 'Sequenciais (74LS, 4000)',
  'On': 'Ligado', 'Levers on': 'Alavancas ligadas', 'Frequency (Hz)': 'Frequência (Hz)',
  'red': 'vermelho', 'green': 'verde', 'yellow': 'amarelo', 'blue': 'azul', 'white': 'branco', 'black': 'preto', 'orange': 'laranja', 'purple': 'roxo',
  // a part's details (#4126, core/circuit-part-info.js)
  'Part info': 'Informação da peça', 'Chip': 'Circuito integrado', 'Family': 'Família', 'Package': 'Encapsulamento', 'Supply': 'Alimentação', 'Logic': 'Lógica',
  'Typical delay': 'Atraso típico', 'Open collector': 'Coletor aberto', 'An input left open': 'Uma entrada deixada no ar',
  'Reads 1 (a TTL input)': 'Lê 1 (uma entrada TTL)', 'Reads X (unknown): connect every CMOS input': 'Lê X (desconhecido): ligue todas as entradas CMOS',
  'input': 'entrada', 'output': 'saída', 'open-collector output': 'saída de coletor aberto', 'supply +5 V': 'alimentação +5 V', 'supply GND': 'alimentação GND',
  'not connected': 'não ligado', 'contact': 'contacto', 'weak output': 'saída fraca', 'tip': 'ponta',
  'Plug the parts into its holes: the five holes a–e of a column are joined, and f–j; each rail along its edges is joined along the board, for +5 V and GND.':
    'Encaixe as peças nos seus furos: os cinco furos a–e de uma coluna estão ligados, e f–j; cada linha ao longo das suas margens está ligada ao longo da placa, para +5 V e GND.',
  'Plug the parts into its holes: the five holes a–e of a column are joined, and f–j; each rail along its edges is joined along half the board, cut in the middle.':
    'Encaixe as peças nos seus furos: os cinco furos a–e de uma coluna estão ligados, e f–j; cada linha ao longo das suas margens está ligada ao longo de metade da placa, cortada ao meio.',
  'Gives +5 V (a logic 1) on its + terminal and GND (a logic 0) on its − terminal: wire them to the breadboard\'s rails.':
    'Dá +5 V (um 1 lógico) no seu terminal + e GND (um 0 lógico) no seu terminal −: ligue-os às linhas de alimentação da placa de ensaio.',
  'Drives its output to 1 or 0, as it is set: click it while trying the circuit. An input of the HDL.':
    'Põe a sua saída a 1 ou a 0, conforme a posição: clique nele ao experimentar o circuito. Uma entrada do HDL.',
  'Joins its two pins while it is pressed (momentary, normally open): with a pull-up or a pull-down, it gives a 0 or a 1. An input of the HDL.':
    'Liga os seus dois pinos enquanto está premido (momentâneo, normalmente aberto): com um pull-up ou um pull-down, dá um 0 ou um 1. Uma entrada do HDL.',
  'Joins its middle pin C to A or to B, as it is set. An input of the HDL.': 'Liga o seu pino do meio C a A ou a B, conforme a posição. Uma entrada do HDL.',
  'A row of switches, each joining its pin to the one opposite while it is on. Inputs of the HDL.':
    'Uma fila de interruptores, cada um a ligar o seu pino ao oposto enquanto está ligado. Entradas do HDL.',
  'Drives its output to 1 and 0 in turn, at its frequency. An input of the HDL.': 'Põe a sua saída a 1 e a 0 alternadamente, à sua frequência. Uma entrada do HDL.',
  'A weak 1 (a resistor to +5 V): its net reads 1 unless something drives it to 0.': 'Um 1 fraco (uma resistência para +5 V): a sua rede lê 1 a menos que algo a ponha a 0.',
  'A weak 0 (a resistor to GND): its net reads 0 unless something drives it to 1.': 'Um 0 fraco (uma resistência para GND): a sua rede lê 0 a menos que algo a ponha a 1.',
  'Lights while its anode A is at 1 and its cathode K at 0. An output of the HDL.': 'Acende enquanto o seu ânodo A está a 1 e o seu cátodo K a 0. Uma saída do HDL.',
  'Seven segments a–g and a point DP, each an LED; common cathode: a segment lights while its pin is at 1 and COM at 0. Outputs of the HDL.':
    'Sete segmentos a–g e um ponto DP, cada um um LED; cátodo comum: um segmento acende enquanto o seu pino está a 1 e COM a 0. Saídas do HDL.',
  'Seven segments a–g and a point DP, each an LED; common anode: a segment lights while its pin is at 0 and COM at 1. Outputs of the HDL.':
    'Sete segmentos a–g e um ponto DP, cada um um LED; ânodo comum: um segmento acende enquanto o seu pino está a 0 e COM a 1. Saídas do HDL.',
  'Ten LEDs side by side, each lighting while its anode is at 1 and its cathode at 0. Outputs of the HDL.':
    'Dez LEDs lado a lado, cada um aceso enquanto o seu ânodo está a 1 e o seu cátodo a 0. Saídas do HDL.',
  'Shows the level of the net its tip touches: H (1), L (0), – (open) or X (unknown). Not a port of the HDL.':
    'Mostra o nível da rede em que a sua ponta toca: H (1), L (0), – (no ar) ou X (desconhecido). Não é uma porta do HDL.',
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
  [/^— the circuit has errors: ([\s\S]+)$/, '— o circuito tem erros: $1'],
  // the status line's counts (#2763)
  [/^(\d+) IC\(s\) · (\d+) input\(s\) · (\d+) display\(s\) · (\d+) wire\(s\)$/, '$1 CI(s) · $2 entrada(s) · $3 mostrador(es) · $4 fio(s)'],
  // the library's parts and ICs, their tips, the selection's title, a pinout's
  [new RegExp(`^(\\d{4,5}) (${TITLES})$`), (m, n, t) => `${n} ${title(t)}`],
  [new RegExp(`^(${TITLES}): click it, then the drawing \\(Esc: done\\)$`), (m, t) => `${title(t)}: clique nela e depois no desenho (Esc: terminar)`],
  [new RegExp(`^([A-Za-z]\\w*): (${TITLES})$`), (m, id, t) => `${id}: ${title(t)}`],
  [new RegExp(`^(${TITLES}): pinout$`), (m, t) => `${title(t)}: pinos`],
  [new RegExp(`^(${TITLES})$`), (m, t) => title(t)],
  [/^((?:SN74LS|CD)\d{2,4}B?): pinout$/, '$1: pinos'],
  [/^Input ([A-Za-z]\w*(?:_…)?) of the HDL$/, 'Entrada $1 do HDL'], [/^Output ([A-Za-z]\w*(?:_…)?) of the HDL$/, 'Saída $1 do HDL'],
  [/^Wire ([A-Za-z]\w*)$/, 'Fio $1'], [/^Lever (\d+)$/, 'Alavanca $1'],
];
