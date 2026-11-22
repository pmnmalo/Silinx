// Portuguese strings of the digital circuit editor (web/js/circuit-editor.js, #3897; merged into the dictionary of i18n.js).
export const CIRCUIT_PT = {
  // New Source, the Design pane
  'Circuit': 'Circuito', 'Digital Electronic Circuit': 'Circuito Eletrónico Digital',
  // its schematic in the Design pane (#4069)
  'Generated from the circuit': 'Gerado a partir do circuito', 'Generated from the circuit, in its HDL logic form': 'Gerado a partir do circuito, na sua forma da lógica do HDL',
  // the Digital Electronic Circuit Wizard (#4061, core/circuit-templates.js)
  'Digital Electronic Circuit Wizard': 'Assistente de Circuito Eletrónico Digital', 'Circuit (module) name:': 'Nome do circuito (módulo):',
  'The wizard creates a digital electronic circuit from a typical assembly: breadboards, their supply, switches and LEDs ready for your chips, or chips already wired to their switches, LEDs and display.': 'O assistente cria um circuito eletrónico digital a partir de uma montagem típica: placas de ensaio, a sua alimentação, interruptores e LEDs prontos para os seus chips, ou chips já ligados aos seus interruptores, LEDs e mostrador.',
  'The wizard creates a digital electronic circuit from a typical assembly: breadboards, their supply, switches and LEDs ready for your chips, or chips already wired to their switches, LEDs and display; its HDL is generated from it.': 'O assistente cria um circuito eletrónico digital a partir de uma montagem típica: placas de ensaio, a sua alimentação, interruptores e LEDs prontos para os seus chips, ou chips já ligados aos seus interruptores, LEDs e mostrador; o seu HDL é gerado a partir dele.',
  'Breadboards and a supply': 'Placas de ensaio e uma fonte', 'Breadboards (N):': 'Placas de ensaio (N):', 'Size:': 'Tamanho:', 'Half (30 columns)': 'Meia (30 colunas)', 'Full (63 columns)': 'Inteira (63 colunas)',
  'N breadboards one under the other, the power supply on the first one\'s top rails; on every board the + rails joined and the − rails joined, and each board\'s rails to the next one\'s.': 'N placas de ensaio umas por baixo das outras, a fonte de alimentação nas linhas de cima da primeira; em cada placa as linhas + ligadas e as linhas − ligadas, e as linhas de cada placa às da seguinte.',
  'Switches and LEDs': 'Interruptores e LEDs', 'Switches (N):': 'Interruptores (N):', 'LEDs (M):': 'LEDs (M):',
  'A half breadboard and its supply, N logic switches in row a (their columns the inputs sw[0]…) and M LEDs in row h, their cathodes on the − rail (their anodes\' columns the outputs led[0]…): the chips go in between.': 'Meia placa de ensaio e a sua fonte, N interruptores lógicos na fila a (as suas colunas as entradas sw[0]…) e M LEDs na fila h, os cátodos na linha − (as colunas dos ânodos as saídas led[0]…): os chips vão no meio.',
  // its assemblies of ICs (#4164, core/circuit-assemblies.js)
  '7-segment display': 'Mostrador de 7 segmentos', 'Display:': 'Mostrador:', 'Common anode (7447)': 'Ânodo comum (7447)', 'Common cathode (7448)': 'Cátodo comum (7448)',
  'Four switches bcd[0]…bcd[3] into a BCD to 7-segment decoder and its display: a 7447 and a common anode display (its segments pulled up), or a 7448 and a common cathode one.': 'Quatro interruptores bcd[0]…bcd[3] num descodificador de BCD para 7 segmentos e no seu mostrador: um 7447 e um mostrador de ânodo comum (os seus segmentos com pull-up), ou um 7448 e um de cátodo comum.',
  'Counter with display': 'Contador com mostrador', 'Counter:': 'Contador:', '7490 (decade)': '7490 (década)', '74161 (4-bit binary)': '74161 (binário de 4 bits)', 'Clock (Hz):': 'Relógio (Hz):',
  'A clock into a counter, its count on a 7447 and a common anode display: a 7490 (counting 0 to 9, QA into CKB) or a 74161 (0 to 15). Press rst first: it clears the count.': 'Um relógio num contador, a sua contagem num 7447 e num mostrador de ânodo comum: um 7490 (contando de 0 a 9, QA em CKB) ou um 74161 (de 0 a 15). Carregue primeiro em rst: limpa a contagem.',
  '4-bit adder': 'Somador de 4 bits', 'Adder:': 'Somador:',
  'Eight switches a[0]…a[3] and b[0]…b[3] into a 4-bit adder (its carry in on −), its sum on the LEDs s[0]…s[3] and its carry out on cout.': 'Oito interruptores a[0]…a[3] e b[0]…b[3] num somador de 4 bits (o seu transporte de entrada em −), a sua soma nos LEDs s[0]…s[3] e o seu transporte de saída em cout.',
  'Gate test bench': 'Bancada de teste de portas', 'Gate IC:': 'CI de portas:', '7400 (NAND)': '7400 (NAND)', '7402 (NOR)': '7402 (NOR)', '7404 (NOT)': '7404 (NOT)', '7408 (AND)': '7408 (AND)', '7432 (OR)': '7432 (OR)', '7486 (XOR)': '7486 (XOR)',
  'A gate IC on the board, powered: each gate\'s inputs on switches a[k] (and b[k]), its output on an LED y[k].': 'Um CI de portas na placa, alimentado: as entradas de cada porta em interruptores a[k] (e b[k]), a sua saída num LED y[k].',
  'Comparator': 'Comparador',
  'Eight switches a[0]…a[3] and b[0]…b[3] into a 7485 (its cascading inputs: A=B high), the LEDs lt, eq and gt its outputs A<B, A=B and A>B.': 'Oito interruptores a[0]…a[3] e b[0]…b[3] num 7485 (as suas entradas de cascata: A=B a 1), os LEDs lt, eq e gt as suas saídas A<B, A=B e A>B.',
  'Decoder or multiplexer': 'Descodificador ou multiplexador', 'IC:': 'CI:', '74138 (3 to 8 decoder)': '74138 (descodificador de 3 para 8)', '74151 (8 to 1 multiplexer)': '74151 (multiplexador de 8 para 1)',
  'Three switches s[0]…s[2] into a 74138, enabled, its outputs active low on 8 LEDs from + (the one chosen lit); or into a 74151, its data inputs on the switches d[0]…d[7], its outputs Y and W on the LEDs y and w.': 'Três interruptores s[0]…s[2] num 74138, habilitado, as suas saídas ativas a 0 em 8 LEDs a partir de + (aceso o escolhido); ou num 74151, as suas entradas de dados nos interruptores d[0]…d[7], as suas saídas Y e W nos LEDs y e w.',
  'Shift register': 'Registo de deslocamento', 'Register:': 'Registo:', '74164 (8-bit)': '74164 (8 bits)', '74194 (4-bit universal)': '74194 (universal de 4 bits)',
  'A button clk as a manual clock, a button clr that clears it and a data switch din into a 74164 (8 LEDs q[0]…q[7]) or a 74194 shifting right (4 LEDs q[0]…q[3]).': 'Um botão clk como relógio manual, um botão clr que o limpa e um interruptor de dados din num 74164 (8 LEDs q[0]…q[7]) ou num 74194 a deslocar para a direita (4 LEDs q[0]…q[3]).',
  'Flip-flops': 'Flip-flops',
  'A 7474\'s first D flip-flop: a button clk, switches on d, pre_n and clr_n (both on: inactive), LEDs on q and qn; its second flip-flop\'s inputs tied.': 'O primeiro flip-flop D de um 7474: um botão clk, interruptores em d, pre_n e clr_n (ambos ligados: inativos), LEDs em q e qn; as entradas do seu segundo flip-flop fixas.',
  // toolbar
  'Wire': 'Fio', 'Show inside': 'Mostrar o interior', 'Wires': 'Fios',
  'Show what is inside the parts: the gates of each IC and its pins\' names, the strips of holes joined in each breadboard': 'Mostrar o interior das peças: as portas de cada CI e os nomes dos seus pinos, as tiras de furos ligados de cada placa de ensaio',
  // the ⋮ menu's Wires (#4080; its labels the schematic's, i18n-schematic.js)
  'Each wire a straight line from point to point': 'Cada fio uma linha reta de ponto a ponto', 'Each wire of horizontal and vertical segments': 'Cada fio de segmentos horizontais e verticais',
  'Each wire a smooth curve through its bends, as a jumper wire': 'Cada fio uma curva suave pelas suas dobras, como um fio de ligação',
  'Stop trying it out and go back to editing the circuit (Esc)': 'Parar de experimentar e voltar a editar o circuito (Esc)',
  'Draw a wire: click its start on a pin or a hole, then its end (the points between: where it goes through); it is made in the ⋮ menu\'s wire style, routed when Orthogonal (double click or Esc: end it there)': 'Desenhar um fio: clique no início, num pino ou num furo, e depois no fim (os pontos entre eles: por onde passa); é feito no estilo de fios do menu ⋮, encaminhado quando Ortogonal (duplo clique ou Esc: acaba aí)',
  'Turn the selected part a quarter clockwise (R)': 'Rodar a peça selecionada um quarto de volta no sentido dos ponteiros do relógio (R)',
  'Check the circuit: short circuits, unpowered ICs, floating inputs, parts and wires that join nothing': 'Verificar o circuito: curto-circuitos, CIs sem alimentação, entradas no ar, peças e fios que não ligam nada',
  'Try it: click a switch to flip it, press a button to hold it; the LEDs and each pin\'s level show the circuit working': 'Experimentar: clique num interruptor para o mudar, carregue num botão para o manter premido; os LEDs e o nível de cada pino mostram o circuito a funcionar',
  'Start the simulation again from time 0': 'Recomeçar a simulação no instante 0',
  'Moving or turning a part: its wires\' ends follow its pins and holes, or stay where they are (a breadboard always carries the parts on it)': 'Ao mover ou rodar uma peça: as pontas dos fios seguem os seus pinos e furos, ou ficam onde estão (uma placa de ensaio leva sempre as peças que tem)',
  // side panel
  'Parts': 'Peças', 'Search parts…': 'Procurar peças…', '☰ Parts': '☰ Peças', 'Show / hide the parts panel': 'Mostrar / esconder o painel das peças',
  'Collapse the Parts panel': 'Recolher o painel das peças', 'Expand the Parts panel': 'Expandir o painel das peças', 'Breadboards': 'Placas de ensaio', 'Power': 'Alimentação', 'Inputs': 'Entradas', 'Outputs': 'Saídas', 'Gates (74LS)': 'Portas (74LS)',
  'Label': 'Etiqueta', 'Colour': 'Cor', 'Gates (4000)': 'Portas (4000)', 'MSI (74LS, 4000)': 'MSI (74LS, 4000)', 'Sequential (74LS, 4000)': 'Sequenciais (74LS, 4000)',
  'On': 'Ligado', 'Levers on': 'Alavancas ligadas', 'Frequency (Hz)': 'Frequência (Hz)',
  'red': 'vermelho', 'green': 'verde', 'yellow': 'amarelo', 'blue': 'azul', 'white': 'branco', 'black': 'preto', 'orange': 'laranja', 'purple': 'roxo',
  // a part's details (#4126, core/circuit-part-info.js)
  // a project's KiCad parts (#4281)
  // the ⋮ menu's KiCad exports (#4282)
  'KiCad': 'KiCad', 'Export ICs as KiCad Symbols…': 'Exportar CIs como símbolos KiCad…', 'Export ICs as KiCad Symbols': 'Exportar CIs como símbolos KiCad',
  'Export Parts as KiCad Package…': 'Exportar peças como pacote KiCad…', 'Export Parts as KiCad Package': 'Exportar peças como pacote KiCad',
  'The library\'s ICs as a KiCad symbol library (.kicad_sym)': 'Os CIs da biblioteca como uma biblioteca de símbolos KiCad (.kicad_sym)',
  'The project\'s KiCad parts as a KiCad Plugin and Content Manager package (.zip)': 'As peças KiCad do projeto como um pacote do Plugin and Content Manager do KiCad (.zip)',
  'The library\'s ICs as a KiCad symbol library: each one a unit per gate and its supply\'s, its footprint a DIP, its behaviour in its properties (Silinx reads it back as that IC).': 'Os CIs da biblioteca como uma biblioteca de símbolos KiCad: cada um com uma unidade por porta e outra da alimentação, o footprint um DIP, o comportamento nas suas propriedades (o Silinx volta a lê-lo como esse CI).',
  'The project\'s parts only': 'Só as peças do projeto', 'Identifier:': 'Identificador:', 'Description:': 'Descrição:', 'Version:': 'Versão:',
  'KiCad parts (project)': 'Peças KiCad (projeto)', 'KiCad catalogue': 'Catálogo KiCad', 'Import KiCad Part…': 'Importar peça KiCad…', 'Import KiCad Part': 'Importar peça KiCad',
  'Pick a KiCad symbol library (.kicad_sym, KiCad 6 to 10), a footprint (.kicad_mod), a KiCad PCM package (.zip) or a .kicad_symdir folder: it is copied into the project\'s parts/ folder as KiCad wrote it.': 'Escolha uma biblioteca de símbolos KiCad (.kicad_sym, KiCad 6 a 10), um footprint (.kicad_mod), um pacote do PCM do KiCad (.zip) ou uma pasta .kicad_symdir: é copiado para a pasta parts/ do projeto tal como o KiCad o escreveu.',
  'or a folder:': 'ou uma pasta:',
  'File:': 'Ficheiro:', 'Source:': 'Origem:', 'Author:': 'Autor:', 'Licence:': 'Licença:', 'Symbol': 'Símbolo', 'Model': 'Modelo', 'It is': 'É',
  // Browse KiCad Libraries… (#4285)
  'Browse KiCad Libraries…': 'Explorar bibliotecas KiCad…', 'Browse KiCad Libraries': 'Explorar bibliotecas KiCad', 'Search libraries…': 'Procurar bibliotecas…',
  'Browse KiCad\'s own symbol libraries and the KiCad PCM\'s library packages': 'Explorar as bibliotecas de símbolos do próprio KiCad e os pacotes de bibliotecas do PCM do KiCad',
  'Library': 'Biblioteca', 'Version': 'Versão', 'Size': 'Tamanho',
  'KiCad\'s own symbol libraries and the KiCad Plugin and Content Manager\'s library packages, fetched by Silinx\'s server and kept for offline use. Each one has its own licence.': 'As bibliotecas de símbolos do próprio KiCad e os pacotes de bibliotecas do Plugin and Content Manager do KiCad, obtidos pelo servidor do Silinx e guardados para uso sem rede. Cada uma tem a sua própria licença.',
  'Tick the symbol libraries to import: their parts are the project\'s circuits\' parts, as KiCad wrote them.': 'Assinale as bibliotecas de símbolos a importar: as suas peças passam a ser peças dos circuitos do projeto, tal como o KiCad as escreveu.',
  'By its part number': 'Pela sua referência', 'Its model\'s': 'A do seu modelo', 'Drawn only (not simulated)': 'Só desenhada (não simulada)', 'Not a part': 'Não é uma peça',
  'Import a KiCad symbol library or footprint into the project\'s parts/ folder': 'Importar uma biblioteca de símbolos ou um footprint KiCad para a pasta parts/ do projeto',
  'HDL module': 'Módulo HDL', 'KiCad symbol': 'Símbolo KiCad', 'Part number': 'Referência', 'Datasheet': 'Folha de dados', 'Footprint': 'Footprint', 'Source': 'Origem', 'Author': 'Autor', 'Licence': 'Licença',
  'Drawn only: not simulated, its pins drive nothing.': 'Só desenhada: não é simulada, os seus pinos não conduzem nada.', 'not simulated': 'não simulado',
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
  'a wire joins two different places': 'um fio liga dois sítios diferentes',   // (#5164)
};
// the parts' titles (core/circuit-parts.js, core/circuit-ics.js)
const TITLE = { 'Half breadboard': 'Meia placa de ensaio', 'Full breadboard (its rails split in the middle)': 'Placa de ensaio inteira (as linhas de alimentação cortadas ao meio)',
  'Power supply (+5 V, GND)': 'Fonte de alimentação (+5 V, GND)', 'Logic switch': 'Interruptor lógico',
  'Push button (momentary, normally open)': 'Botão de pressão (momentâneo, normalmente aberto)', 'Slide switch (SPDT)': 'Comutador deslizante (SPDT)',
  'DIP switch (4)': 'Interruptor DIP (4)', 'DIP switch (8)': 'Interruptor DIP (8)', 'Clock source': 'Fonte de relógio',
  'Pull-up (a weak 1)': 'Pull-up (um 1 fraco)', 'Pull-down (a weak 0)': 'Pull-down (um 0 fraco)', LED: 'LED',
  '7-segment display, common cathode': 'Mostrador de 7 segmentos, cátodo comum', '7-segment display, common anode': 'Mostrador de 7 segmentos, ânodo comum',
  'LED bar (10)': 'Barra de LEDs (10)', 'Logic probe': 'Sonda lógica', 'Hex inverter': 'Seis inversores', 'Hex Schmitt-trigger inverter': 'Seis inversores Schmitt-trigger',
  // (KiCad's other gates, #4397)
  'Hex buffer, open collector': 'Seis buffers, coletor aberto', 'Hex buffer': 'Seis buffers', 'Hex inverting buffer': 'Seis buffers inversores',
  'Dual 4-input NAND, Schmitt trigger': 'Duas portas NAND de 4 entradas, Schmitt-trigger', 'Quad 2-input NAND, Schmitt trigger': 'Quatro portas NAND de 2 entradas, Schmitt-trigger',
  'Quad 2-input NAND, open collector, high voltage': 'Quatro portas NAND de 2 entradas, coletor aberto, alta tensão',
  'Quad 2-input NOR buffer': 'Quatro portas NOR de 2 entradas, buffer', 'Quad 2-input NOR buffer, open collector': 'Quatro portas NOR de 2 entradas, buffer, coletor aberto',
  'Quad 2-input NAND buffer': 'Quatro portas NAND de 2 entradas, buffer', 'Quad 2-input NAND buffer, open collector': 'Quatro portas NAND de 2 entradas, buffer, coletor aberto',
  'Dual 4-input NAND buffer': 'Duas portas NAND de 4 entradas, buffer', '13-input NAND': 'Uma porta NAND de 13 entradas', 'Quad 2-input XNOR': 'Quatro portas XNOR de 2 entradas',
  'Dual AND-OR-INVERT (3-3 and 2-2 inputs)': 'Duas portas AND-OR-INVERT (3-3 e 2-2 entradas)', '4-wide AND-OR-INVERT (2-3-3-2 inputs)': 'Uma porta AND-OR-INVERT de 4 termos (2-3-3-2 entradas)',
  '2-wide 4-input AND-OR-INVERT': 'Uma porta AND-OR-INVERT de 2 termos de 4 entradas',
  // (the three-state buffers, #4397)
  'Quad buffer, 3-state outputs, active-low enables': 'Quatro buffers, saídas tri-state, enables ativos a 0',
  'Quad buffer, 3-state outputs, active-high enables': 'Quatro buffers, saídas tri-state, enables ativos a 1',
  'Octal inverting buffer, 3-state outputs': 'Oito buffers inversores, saídas tri-state', 'Octal buffer, 3-state outputs': 'Oito buffers, saídas tri-state',
  'Octal buffer, 3-state outputs, complementary enables': 'Oito buffers, saídas tri-state, enables complementares',
  'Hex buffer, 3-state outputs, common enables': 'Seis buffers, saídas tri-state, enables comuns', 'Hex inverting buffer, 3-state outputs, common enables': 'Seis buffers inversores, saídas tri-state, enables comuns',
  'Hex buffer, 3-state outputs, 4 and 2 enabled': 'Seis buffers, saídas tri-state, ativados 4 e 2', 'Hex inverting buffer, 3-state outputs, 4 and 2 enabled': 'Seis buffers inversores, saídas tri-state, ativados 4 e 2',
  'Octal inverting buffer, 3-state outputs, flow-through': 'Oito buffers inversores, saídas tri-state, entradas e saídas em lados opostos',
  'Octal buffer, 3-state outputs, flow-through': 'Oito buffers, saídas tri-state, entradas e saídas em lados opostos',
  'Quad bus transceiver, inverting, 3-state outputs': 'Quatro transceptores de barramento, inversores, saídas tri-state',
  'Quad bus transceiver, 3-state outputs': 'Quatro transceptores de barramento, saídas tri-state', 'Octal bus transceiver, 3-state outputs': 'Oito transceptores de barramento, saídas tri-state',
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
  // (the ICs written once in VHDL, #4397)
  'Dual D flip-flop, set and reset (rising edge)': 'Dois flip-flops D, set e reset (flanco ascendente)', 'Dual J-K flip-flop, set and reset (rising edge)': 'Dois flip-flops J-K, set e reset (flanco ascendente)',
  'Dual J-K flip-flop, clear (falling edge)': 'Dois flip-flops J-K, clear (flanco descendente)', 'Dual J-K flip-flop, preset (falling edge)': 'Dois flip-flops J-K, preset (flanco descendente)',
  'Dual J-K flip-flop, preset, common clock and clear (falling edge)': 'Dois flip-flops J-K, preset, relógio e clear comuns (flanco descendente)',
  'Dual J-K̅ flip-flop, preset and clear (rising edge)': 'Dois flip-flops J-K̅, preset e clear (flanco ascendente)',
  '4-bit bistable latch, Q and Q̅': 'Quatro latches biestáveis, Q e Q̅', '4-bit bistable latch': 'Quatro latches biestáveis', 'Quad S̅-R̅ latch': 'Quatro latches S̅-R̅',
  'Hex D flip-flop, clear (rising edge)': 'Seis flip-flops D, clear (flanco ascendente)', 'Quad D flip-flop, clear, Q and Q̅ (rising edge)': 'Quatro flip-flops D, clear, Q e Q̅ (flanco ascendente)',
  'Octal D flip-flop, clear (rising edge)': 'Oito flip-flops D, clear (flanco ascendente)', 'Octal D flip-flop, enable (rising edge)': 'Oito flip-flops D, enable (flanco ascendente)',
  'Hex D flip-flop, enable (rising edge)': 'Seis flip-flops D, enable (flanco ascendente)', 'Quad D flip-flop, enable, Q and Q̅ (rising edge)': 'Quatro flip-flops D, enable, Q e Q̅ (flanco ascendente)',
  '4-bit D register, 3-state outputs (rising edge)': 'Registo D de 4 bits, saídas tri-state (flanco ascendente)', 'Octal transparent latch, 3-state outputs': 'Oito latches transparentes, saídas tri-state',
  'Octal D flip-flop, 3-state outputs (rising edge)': 'Oito flip-flops D, saídas tri-state (flanco ascendente)',
  'Octal transparent latch, 3-state outputs, flow-through': 'Oito latches transparentes, saídas tri-state, entradas e saídas em lados opostos',
  'Octal D flip-flop, 3-state outputs, flow-through (rising edge)': 'Oito flip-flops D, saídas tri-state, entradas e saídas em lados opostos (flanco ascendente)',
  // (the counters written once in VHDL, #4397)
  'Synchronous decade counter, asynchronous clear': 'Contador de década síncrono, clear assíncrono', 'Synchronous decade counter, synchronous clear': 'Contador de década síncrono, clear síncrono',
  'Synchronous up/down decade counter': 'Contador de década síncrono crescente/decrescente', 'Synchronous up/down binary counter': 'Contador binário síncrono crescente/decrescente',
  'Synchronous up/down decade counter, dual clock': 'Contador de década síncrono crescente/decrescente, dois relógios',
  'Presettable decade counter (divide by 2 and by 5, falling edges)': 'Contador de década com carregamento (divide por 2 e por 5, flancos descendentes)',
  'Presettable 4-bit binary counter (divide by 2 and by 8, falling edges)': 'Contador binário de 4 bits com carregamento (divide por 2 e por 8, flancos descendentes)',
  'Dual decade counter (divide by 2 and by 5, falling edges)': 'Dois contadores de década (divide por 2 e por 5, flancos descendentes)',
  'Dual 4-bit binary counter (falling edge)': 'Dois contadores binários de 4 bits (flanco descendente)',
  'Divide-by-12 counter (divide by 2 and by 6, falling edges)': 'Contador divisor por 12 (divide por 2 e por 6, flancos descendentes)',
  '8-bit binary counter, output register, 3-state outputs': 'Contador binário de 8 bits, registo de saída, saídas tri-state',
  '14-stage binary ripple counter': 'Contador binário assíncrono de 14 andares', '12-stage binary ripple counter': 'Contador binário assíncrono de 12 andares',
  'Octal counter/divider with 8 decoded outputs': 'Contador/divisor por 8 com 8 saídas descodificadas',
  'Presettable up/down counter, binary or decade': 'Contador crescente/decrescente com carregamento, binário ou de década',
  'Presettable up/down decade counter': 'Contador de década pré-carregável crescente/decrescente',
  'Dual BCD up counter': 'Dois contadores BCD crescentes', 'Dual 4-bit binary up counter': 'Dois contadores binários crescentes de 4 bits',
  // (the shift registers written once in VHDL, #4397)
  '8-bit serial in, serial out shift register': 'Registo de deslocamento de 8 bits, entrada e saída série',
  '4-bit shift register, parallel load (falling edges)': 'Registo de deslocamento de 4 bits, carregamento paralelo (flancos descendentes)',
  '8-bit parallel in, serial out shift register, clear': 'Registo de deslocamento de 8 bits, entrada paralela e saída série, clear',
  '4-bit parallel-access shift register, J-K̅ serial input': 'Registo de deslocamento de 4 bits de acesso paralelo, entrada série J-K̅',
  '4-bit shift register, parallel load, 3-state outputs (falling edge)': 'Registo de deslocamento de 4 bits, carregamento paralelo, saídas tri-state (flanco descendente)',
  '8-bit shift register, output register with clear': 'Registo de deslocamento de 8 bits, registo de saída com clear',
  '8-bit shift register, output latches, open-collector outputs': 'Registo de deslocamento de 8 bits, latches de saída, saídas em coletor aberto',
  '8-stage static shift register with asynchronous parallel load': 'Registo de deslocamento estático de 8 andares com carregamento paralelo assíncrono',
  // (the decoders, display drivers and encoders written once in VHDL, #4397)
  'BCD to decimal decoder': 'Descodificador BCD para decimal', 'BCD to decimal decoder/driver, open collector': 'Descodificador/driver BCD para decimal, coletor aberto',
  '3-to-8 line decoder with address latches, outputs active low': 'Descodificador de 3 para 8 linhas com latches de endereço, saídas ativas a 0',
  '3-to-8 line decoder with address latches, outputs active high': 'Descodificador de 3 para 8 linhas com latches de endereço, saídas ativas a 1',
  '3-to-8 line decoder, outputs active high': 'Descodificador de 3 para 8 linhas, saídas ativas a 1', '4-to-16 line decoder': 'Descodificador de 4 para 16 linhas',
  'Dual 2-to-4 line decoder/demultiplexer': 'Dois descodificadores/desmultiplexadores de 2 para 4 linhas',
  'Dual 2-to-4 line decoder/demultiplexer, open collector': 'Dois descodificadores/desmultiplexadores de 2 para 4 linhas, coletor aberto',
  'BCD to 7-segment decoder/driver, open collector, active high': 'Descodificador BCD para 7 segmentos, coletor aberto, ativo a 1',
  '10-line to 4-line priority encoder': 'Codificador de prioridade de 10 para 4 linhas', '8-line to 3-line priority encoder': 'Codificador de prioridade de 8 para 3 linhas',
  'BCD to 7-segment decoder/driver, open collector (30 V), active low, tails': 'Descodificador BCD para 7 segmentos, coletor aberto (30 V), ativo a 0, com caudas',
  'BCD to 7-segment decoder/driver, open collector (15 V), active low, tails': 'Descodificador BCD para 7 segmentos, coletor aberto (15 V), ativo a 0, com caudas',
  'BCD to 7-segment decoder/driver, active high, tails': 'Descodificador BCD para 7 segmentos, ativo a 1, com caudas',
  'BCD to 7-segment latch/decoder/driver, phase input': 'Latch/descodificador BCD para 7 segmentos, entrada de fase',
  '8-line to 3-line priority encoder, 3-state outputs': 'Codificador de prioridade de 8 para 3 linhas, saídas tri-state',
  // (the multiplexers, arithmetic, comparators and parity ICs written once in VHDL, #4397)
  'Quad 2-to-1 line multiplexer, inverting': 'Quatro multiplexadores de 2 para 1 linha, inversores',
  'Quad 2-to-1 line multiplexer, 3-state outputs': 'Quatro multiplexadores de 2 para 1 linha, saídas tri-state',
  'Quad 2-to-1 line multiplexer, inverting, 3-state outputs': 'Quatro multiplexadores de 2 para 1 linha, inversores, saídas tri-state',
  '8-to-1 line multiplexer, 3-state outputs': 'Multiplexador de 8 para 1 linha, saídas tri-state',
  'Dual 4-to-1 line multiplexer, 3-state outputs': 'Dois multiplexadores de 4 para 1 linha, saídas tri-state',
  'Dual 4-to-1 line multiplexer, inverting': 'Dois multiplexadores de 4 para 1 linha, inversores',
  'Dual 4-to-1 line multiplexer, inverting, 3-state outputs': 'Dois multiplexadores de 4 para 1 linha, inversores, saídas tri-state',
  'Quad 2-input multiplexer with storage (falling edge)': 'Quatro multiplexadores de 2 entradas com registo (flanco descendente)',
  '4-bit arithmetic logic unit': 'Unidade aritmética e lógica de 4 bits', 'Look-ahead carry generator': 'Gerador de transporte antecipado',
  '9-bit odd/even parity generator/checker': 'Gerador/verificador de paridade par/ímpar de 9 bits', '8-bit identity comparator': 'Comparador de igualdade de 8 bits',
  // (the memories and storage ICs written once in VHDL, #4397)
  '4 × 4 register file, 3-state outputs': 'Banco de registos de 4 × 4, saídas tri-state', '4 × 4 register file, open-collector outputs': 'Banco de registos de 4 × 4, saídas em coletor aberto',
  '8-bit addressable latch': 'Latch endereçável de 8 bits', 'Dual 4-bit addressable latch': 'Dois latches endereçáveis de 4 bits',
  '4-bit cascadable shift register, 3-state outputs (falling edge)': 'Registo de deslocamento de 4 bits em cascata, saídas tri-state (flanco descendente)',
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
const TITLES = `(?:${[...Object.keys(TITLE).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), GATES].join('|')})`;
const title = (t) => TITLE[t] ?? t.replace(/^(?:(Quad|Triple|Dual) \d|8)-input (\w+)(, open collector)?$/, (m, n, g, oc) => `${n ? COUNT[n][0] : 'Uma porta'} ${g} de ${n ? COUNT[n][1] : 8} entradas${oc ? ', coletor aberto' : ''}`);
// (the library's parts a KiCad part may behave as besides its ICs, #4349: their titles, with their article)
const OTHER = { LED: 'o LED', 'Slide switch (SPDT)': 'o comutador deslizante (SPDT)', 'Push button (momentary, normally open)': 'o botão de pressão (momentâneo, normalmente aberto)' };
const OTHERS = `(${Object.keys(OTHER).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
const BY = { symbol: 'pelo seu símbolo', 'Silinx.Model': 'pelo seu Silinx.Model' };
export const CIRCUIT_PT_PATTERNS = [
  // a KiCad part behaving as the library's LED, slide switch or push button (#4349)
  [new RegExp(`^(.+), as the ${OTHERS} of the library: click it, then the drawing \\(Esc: done\\)$`), (m, v, t) => `${v}, como ${OTHER[t]} da biblioteca: clique nela e depois no desenho (Esc: terminar)`],
  [new RegExp(`^(.+), as the ${OTHERS} of the library \\((.+), (.+)\\): click it to import it into the project$`), (m, v, t, lib, lic) => `${v}, como ${OTHER[t]} da biblioteca (${lib}, ${lic}): clique para a importar para o projeto`],
  [new RegExp(`^Behaves as the ${OTHERS} of the library \\(by its (symbol|Silinx\\.Model)\\)\\.$`), (m, t, b) => `Comporta-se como ${OTHER[t]} da biblioteca (${BY[b]}).`],
  [new RegExp(`^As the ${OTHERS} \\(by its (symbol|Silinx\\.Model)\\)$`), (m, t, b) => `Como ${OTHER[t]} (${BY[b]})`],
  [new RegExp(`^(.+): as the ${OTHERS} of the library$`), (m, v, t) => `${v}: como ${OTHER[t]} da biblioteca`],
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
  // a project's KiCad parts (#4281): their tips, what they behave as, a pinout
  [/^(.+), as the (\d{4,5}): click it, then the drawing \(Esc: done\)$/, '$1, como o $2: clique nela e depois no desenho (Esc: terminar)'],
  [/^(.+), drawn only \(not simulated\): click it, then the drawing \(Esc: done\)$/, '$1, só desenhada (não simulada): clique nela e depois no desenho (Esc: terminar)'],
  [/^Behaves as the (\d{4,5}) of the library \(by its part number\)\.$/, 'Comporta-se como o $1 da biblioteca (pela sua referência).'],
  [/^Behaves as the (\d{4,5}) of the library \(by its Silinx\.Model\)\.$/, 'Comporta-se como o $1 da biblioteca (pelo seu Silinx.Model).'],
  [/^(.+): pinout$/, '$1: pinos'],
  // a KiCad part modelled by a module of the project (#4283)
  [/^(.+), by its module (\w+): click it, then the drawing \(Esc: done\)$/, '$1, pelo seu módulo $2: clique nela e depois no desenho (Esc: terminar)'],
  [/^Simulated by the project's module (\w+), in Try it and in the HDL\.$/, 'Simulada pelo módulo $1 do projeto, no Experimentar e no HDL.'],
  [/^By its module (\w+)$/, 'Pelo seu módulo $1'],
  // the KiCad exports (#4282): the choice of the ICs, the package's hint
  [/^All the library's ICs \((\d+)\)$/, 'Todos os CIs da biblioteca ($1)'], [/^With the library's ICs \((\d+)\)$/, 'Com os CIs da biblioteca ($1)'],
  [/^With the library's parts \((\d+)\), their footprints too$/, 'Com as peças da biblioteca ($1), também os seus footprints'], [/^This circuit's ICs \((\d+)\)$/, 'Os CIs deste circuito ($1)'],
  [/^The project's KiCad parts \(its parts\/ folder: (\d+) file\(s\)\) as a KiCad Plugin and Content Manager package, to install in KiCad or to import in Silinx\.$/, 'As peças KiCad do projeto (a sua pasta parts/: $1 ficheiro(s)) como um pacote do Plugin and Content Manager do KiCad, para instalar no KiCad ou importar no Silinx.'],
  // the KiCad catalogue (#4305): its parts' tips, a replace asked
  [/^(.+), as the (\d{4,5}): (.+) \((.+), (.+)\): click it to import it into the project$/, (m, v, n, t, lib, lic) => `${v}, como o ${n}: ${title(t)} (${lib}, ${lic}): clique para a importar para o projeto`],
  [/^(.+), drawn only: (\d+) pin\(s\)(, DIP-\d+)? \((.+), (.+)\): click it to import it into the project$/, '$1, só desenhada: $2 pino(s)$3 ($4, $5): clique para a importar para o projeto'],
  [/^(parts\/.+): the project has it already\. Replace it\?$/, '$1: o projeto já o tem. Substituí-lo?'],
  [/^As the (\d{4,5}) \(by its part number\)$/, 'Como o $1 (pela sua referência)'], [/^As the (\d{4,5}) \(by its Silinx\.Model\)$/, 'Como o $1 (pelo seu Silinx.Model)'],
  [/^(\d+) symbol\(s\): (parts\/.+)$/, '$1 símbolo(s): $2'], [/^A footprint: (parts\/.+)$/, 'Um footprint: $1'],
  [/^(.+): (\d+) symbol librar(?:y|ies), (\d+) footprint\(s\)$/, '$1: $2 biblioteca(s) de símbolos, $3 footprint(s)'],
  [/^(parts\/.+) is in the project already\. Replace it\?$/, '$1 já está no projeto. Substituí-lo?'],
  [/^(parts\/.+): the project has it already\. Replace the files of the library\?$/, '$1: o projeto já o tem. Substituir os ficheiros da biblioteca?'],
  // a part moved or turned onto the leads of others, refused (core/circuit-edit.js, #5162)
  [/^(.+) cannot be turned: it would land on the leads of (.+), joining them$/, 'Não é possível rodar $1: ficaria sobre os terminais de $2, ligando-os'],
  [/^(.+) cannot be moved there: it would land on the leads of (.+), joining them$/, 'Não é possível mover $1 para aí: ficaria sobre os terminais de $2, ligando-os'],
  // (the editor's messages in the console: a wire, its properties, Try it's, #5164)
  [/^The circuit cannot be simulated: ([\s\S]+)$/, 'O circuito não pode ser simulado: $1'],
  [/^Short circuit at (\S+) ns: (.+) driven to 0 and 1 at once$/, 'Curto-circuito aos $1 ns: $2 levado a 0 e a 1 ao mesmo tempo'],
  [/^The circuit oscillates: still changing (\S+) ns after (\S+) ns \((.*)\)$/, 'O circuito oscila: ainda a mudar $1 ns depois de $2 ns ($3)'],
  [/^(\S+): no clear orthogonal path \(the parts' pins and the other wires in the way\): drawn straight there$/, '$1: nenhum caminho ortogonal livre (os pinos das peças e os outros fios no caminho): desenhado a direito aí'],
  [/^hz: a frequency from (\S+) to (\S+) Hz$/, 'hz: uma frequência de $1 a $2 Hz'],
];
