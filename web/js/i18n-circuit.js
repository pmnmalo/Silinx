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
  // (a servo, #5347)
  "Its arm at the angle its signal's pulses ask for: 0.5 ms 0°, 2.5 ms 180°, every 20 ms (an Arduino's or an FPGA's PWM), moving at 60° in 0.1 s. Not a port of the HDL.":
    'O seu braço no ângulo que os impulsos do sinal pedem: 0,5 ms 0°, 2,5 ms 180°, a cada 20 ms (o PWM de um Arduino ou de uma FPGA), a mover-se 60° em 0,1 s. Não é uma porta do HDL.',
  // (a temperature sensor, #5342)
  "Its temperature, set while trying it (its − and +, its Properties), read on I²C at 0x48 + A2..A0: 9 bits, 0.5 °C; its OS output (open drain) over TOS (80 °C) and under THYST (75 °C). Not a port of the HDL.":
    'A sua temperatura, escolhida ao experimentá-lo (o seu − e +, as suas Propriedades), lida por I²C em 0x48 + A2..A0: 9 bits, 0,5 °C; a sua saída OS (dreno aberto) acima de TOS (80 °C) e abaixo de THYST (75 °C). Não é uma porta do HDL.',
  'Temperature (°C)': 'Temperatura (°C)',
  // (a character LCD, #5330)
  "Two lines of 16 characters, its HD44780 controller simulated: a write on E's falling edge, RS 0 a command, 1 a character; 8-bit or 4-bit (D7..D4) mode; off until its program turns it on. Not a port of the HDL.":
    'Duas linhas de 16 caracteres, o seu controlador HD44780 simulado: uma escrita no flanco descendente de E, RS a 0 um comando, a 1 um carácter; modo de 8 bits ou de 4 bits (D7..D4); apagado até o seu programa o ligar. Não é uma porta do HDL.',
  // (a graphic OLED, #5336)
  "128 × 64 pixels, its SSD1306 controller simulated on I²C at 0x3C: a control byte, then commands or its display's bytes (8 pages of 128, bit 0 a page's top row); lit while on and its charge pump on. SCL and SDA need a pull-up each. Not a port of the HDL.":
    '128 × 64 píxeis, o seu controlador SSD1306 simulado em I²C no 0x3C: um byte de controlo, depois comandos ou os bytes do seu ecrã (8 páginas de 128, o bit 0 a linha de cima de uma página); aceso quando ligado e com a bomba de carga ligada. O SCL e o SDA precisam de um pull-up cada. Não é uma porta do HDL.',
  // (the boards, #5215)
  "the board's pin": 'pino da placa', 'supply 3.3 V': 'alimentação 3,3 V', 'Boards': 'Placas',
  "Its headers' pins, the board's (D0…D13, A0…A5; SDA and SCL are A4 and A5): its 5V, 3V3 and GND power the breadboard; its other pins are its program's, in a System (alone, they drive nothing).":
    'Os pinos dos seus conectores, os da placa (D0…D13, A0…A5; SDA e SCL são A4 e A5): os seus 5V, 3V3 e GND alimentam a placa de ensaio; os outros pinos são do seu programa, num Sistema (sozinha, não conduzem nada).',
  "A DIP-30 that straddles a breadboard's channel, its pins the board's (D0…D13, A0…A7; A6 and A7 inputs only): its 5V, 3V3 and GND power the breadboard; its other pins are its program's, in a System (alone, they drive nothing).":
    'Um DIP-30 que fica sobre o canal de uma placa de ensaio, os seus pinos os da placa (D0…D13, A0…A7; A6 e A7 só entradas): os seus 5V, 3V3 e GND alimentam a placa de ensaio; os outros pinos são do seu programa, num Sistema (sozinha, não conduzem nada).',
  "Its Pmod connectors' pins (JA1…, each its FPGA's package pin): its 3V3 and GND power the breadboard; its other pins are its design's, in a System (alone, they drive nothing).":
    'Os pinos dos seus conectores Pmod (JA1…, cada um com o pino do encapsulamento da FPGA): os seus 3V3 e GND alimentam a placa de ensaio; os outros pinos são do seu projeto, num Sistema (sozinha, não conduzem nada).',
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
  // a buzzer (#5454, core/circuit-buzzer.js)
  'Buzzer (active, 5 V)': 'Besouro (ativo, 5 V)',
  'An active buzzer: its + at 1 and its − at 0, it sounds at its own tone (about 2.3 kHz); a square wave on its + (an Arduino\'s tone(), a PWM, an FPGA\'s divider) and it sounds at that wave\'s frequency; at 0 it is silent. Not a port of the HDL.':
    'Um besouro ativo: com o + a 1 e o − a 0, soa no seu próprio tom (cerca de 2,3 kHz); com uma onda quadrada no + (o tone() de um Arduino, um PWM, um divisor numa FPGA), soa na frequência dessa onda; a 0 fica em silêncio. Não é um porto do HDL.',
  // an ultrasonic range sensor (#5456, core/circuit-sonar.js)
  'Ultrasonic range sensor (HC-SR04)': 'Sensor de distância ultrassónico (HC-SR04)',
  'Distance (cm)': 'Distância (cm)',
  'An ultrasonic range sensor: a pulse of 10 µs or more on Trig and, about 0.46 ms after it ends, Echo is at 1 for as long as the sound takes to reach the object and come back, 58 µs a centimetre (2 to 400 cm; 38 ms out of its range). The object\'s distance is set while trying it (its − and +), as saved in its properties. Not a port of the HDL.':
    'Um sensor de distância ultrassónico: um impulso de 10 µs ou mais no Trig e, cerca de 0,46 ms depois de acabar, o Echo fica a 1 durante o tempo que o som leva a chegar ao objeto e a voltar, 58 µs por centímetro (2 a 400 cm; 38 ms fora do seu alcance). A distância do objeto define-se ao experimentá-lo (o seu − e +), como guardada nas suas propriedades. Não é um porto do HDL.',
  // the temperature and humidity sensors (#5470, core/circuit-dht.js)
  'Temperature and humidity sensor (DHT11)': 'Sensor de temperatura e humidade (DHT11)',
  'Temperature and humidity sensor (DHT22)': 'Sensor de temperatura e humidade (DHT22)',
  'Humidity (%)': 'Humidade (%)',
  // (the analog parts, #5382)
  // (an oscilloscope, #5383)
  'Oscilloscope': 'Osciloscópio', 'Time base (per division)': 'Base de tempo (por divisão)', 'Scale (per division)': 'Escala (por divisão)', 'Trigger source': 'Fonte do disparo',
  'Trigger edge': 'Flanco do disparo', 'Trigger level (V)': 'Nível do disparo (V)', 'Trigger mode': 'Modo do disparo', 'Rising': 'Ascendente', 'Falling': 'Descendente',
  'Auto': 'Automático', 'Normal': 'Normal', 'Single': 'Único', 'Waiting for the trigger': 'À espera do disparo',
  'Two channels, CH1 and CH2, each the voltage of the net its lead touches against GND, drawn against time while trying the circuit: from its trigger (its source\'s edge through its level; auto shows the last screen without one, normal waits for one, single keeps the first), over its time base and its scale (each its − and +). A click on its screen sets a cursor, then a second: their Δt. Under it, each channel\'s frequency, period, duty cycle, Vpp and mean. Not a port of the HDL.': 'Dois canais, CH1 e CH2, cada um a tensão da rede em que toca a sua ponta em relação a GND, desenhada ao longo do tempo ao experimentar o circuito: a partir do seu disparo (o flanco da sua fonte através do seu nível; automático mostra o último ecrã sem ele, normal espera por um, único guarda o primeiro), na sua base de tempo e na sua escala (cada uma com o seu − e +). Um clique no seu ecrã põe um cursor, depois um segundo: o seu Δt. Por baixo, a frequência, o período, o ciclo de trabalho, o Vpp e a média de cada canal. Não é um porto do HDL.',
  'Analog': 'Analógico', 'Light-dependent resistor (LDR)': 'Resistência dependente da luz (LDR)',
  'Thermistor (NTC, 10 kΩ)': 'Termístor (NTC, 10 kΩ)', 'Diode (1N4148)': 'Díodo (1N4148)', 'Voltmeter': 'Voltímetro', 'terminal': 'terminal',
  'Resistance (Ω)': 'Resistência (Ω)', 'Capacitance (F)': 'Capacidade (F)', 'Position (%)': 'Posição (%)', 'Light (lux)': 'Luz (lux)',
  'Limits the current between its two leads: I = V / R (Ohm\'s law). On a circuit with an analog part, every voltage and current is solved; in the HDL, a resistor from a rail is a pull-up or a pull-down, one between two nets joins them. Not a port of the HDL.': 'Limita a corrente entre os seus dois terminais: I = V / R (lei de Ohm). Num circuito com uma peça analógica, todas as tensões e correntes são calculadas; no HDL, uma resistência de uma linha de alimentação é um pull-up ou um pull-down, uma entre duas redes liga-as. Não é um porto do HDL.',
  'Holds a charge: its voltage changes as its current charges it, I = C dV/dt (through a resistor, an exponential with the time constant RC). Not in the HDL.': 'Guarda uma carga: a sua tensão muda à medida que a sua corrente o carrega, I = C dV/dt (através de uma resistência, uma exponencial com a constante de tempo RC). Não está no HDL.',
  'A resistor with a wiper W between its ends 1 and 3: its position (0 to 100 %, set while trying it: its − and +) divides its resistance, the wiper\'s voltage between its ends\'. Not a port of the HDL.': 'Uma resistência com um cursor W entre os seus extremos 1 e 3: a sua posição (0 a 100 %, definida ao experimentar: o seu − e +) divide a sua resistência, a tensão do cursor entre as dos seus extremos. Não é um porto do HDL.',
  'A light-dependent resistor (GL5528): about 10 kΩ at 10 lux, less with more light, 1 MΩ in the dark. The light (lux) is set while trying it (its − and +). With a resistor, a voltage divider that a Schmitt-trigger input or an ADC reads. Not a port of the HDL.': 'Uma resistência dependente da luz (GL5528): cerca de 10 kΩ a 10 lux, menos com mais luz, 1 MΩ no escuro. A luz (lux) é definida ao experimentar (o seu − e +). Com uma resistência, um divisor de tensão que uma entrada Schmitt-trigger ou um ADC lê. Não é um porto do HDL.',
  'An NTC thermistor, 10 kΩ at 25 °C (B = 3950 K): less resistance as it warms. Its temperature is set while trying it (its − and +). With a resistor, a voltage divider that an ADC reads. Not a port of the HDL.': 'Um termístor NTC, 10 kΩ a 25 °C (B = 3950 K): menos resistência à medida que aquece. A sua temperatura é definida ao experimentar (o seu − e +). Com uma resistência, um divisor de tensão que um ADC lê. Não é um porto do HDL.',
  'A silicon diode (1N4148): it conducts from its anode A to its cathode K (about 0.6 V across it), not the other way. Not in the HDL.': 'Um díodo de silício (1N4148): conduz do seu ânodo A para o seu cátodo K (cerca de 0,6 V aos seus terminais), não no outro sentido. Não está no HDL.',
  'Shows the voltage of its + lead against its COM lead, and draws no current. On a circuit with no analog part, a net\'s level as the volts of what drives it (a 74LS output\'s 1 at 3.4 V). Not a port of the HDL.': 'Mostra a tensão do seu terminal + em relação ao seu terminal COM, e não consome corrente. Num circuito sem peças analógicas, o nível de uma rede como os volts do que a conduz (o 1 de uma saída 74LS a 3,4 V). Não é um porto do HDL.',
  'A temperature and humidity sensor on one wire, its DATA open drain (a pull-up on it, 10 kΩ): the host holds DATA low 18 ms or more and releases it; it answers 80 µs low, 80 µs high, then 40 bits (50 µs low, then 26 µs high a 0, 70 µs a 1): the humidity (%), the temperature (°C), whole, and their checksum. Once a second at most. Its temperature (0 to 50 °C) and humidity (20 to 90 %) are set while trying it (its − and +), as saved in its properties. Not a port of the HDL.':
    'Um sensor de temperatura e humidade num só fio, o seu DATA em dreno aberto (com uma resistência de pull-up, 10 kΩ): o anfitrião mantém DATA a 0 durante 18 ms ou mais e solta-o; ele responde 80 µs a 0, 80 µs a 1, e depois 40 bits (50 µs a 0, e então 26 µs a 1 para um 0, 70 µs para um 1): a humidade (%), a temperatura (°C), inteiras, e a sua soma de verificação. No máximo uma vez por segundo. A sua temperatura (0 a 50 °C) e humidade (20 a 90 %) definem-se ao experimentá-lo (o seu − e +), como guardadas nas suas propriedades. Não é um porto do HDL.',
  'A temperature and humidity sensor on one wire (AM2302), its DATA open drain (a pull-up on it, 10 kΩ): the host holds DATA low 1 ms or more and releases it; it answers 80 µs low, 80 µs high, then 40 bits (50 µs low, then 26 µs high a 0, 70 µs a 1): the humidity and the temperature in tenths (16 bits each, a negative temperature its top bit) and their checksum. Once every 2 seconds at most. Its temperature (−40 to 80 °C) and humidity (0 to 100 %) are set while trying it (its − and +), as saved in its properties. Not a port of the HDL.':
    'Um sensor de temperatura e humidade num só fio (AM2302), o seu DATA em dreno aberto (com uma resistência de pull-up, 10 kΩ): o anfitrião mantém DATA a 0 durante 1 ms ou mais e solta-o; ele responde 80 µs a 0, 80 µs a 1, e depois 40 bits (50 µs a 0, e então 26 µs a 1 para um 0, 70 µs para um 1): a humidade e a temperatura em décimas (16 bits cada, uma temperatura negativa com o bit mais alto a 1) e a sua soma de verificação. No máximo uma vez a cada 2 segundos. A sua temperatura (−40 a 80 °C) e humidade (0 a 100 %) definem-se ao experimentá-lo (o seu − e +), como guardadas nas suas propriedades. Não é um porto do HDL.',
  // a motion sensor, a PIR (#5463, core/circuit-pir.js)
  'Motion sensor (PIR, HC-SR501)': 'Sensor de movimento (PIR, HC-SR501)',
  'Hold time (s)': 'Tempo ativo (s)',
  'Retriggering (H)': 'Redisparável (H)',
  'A motion sensor (PIR): someone moving in front of it (press and hold its dome while trying it: its input, an input of the HDL) sets OUT to 1 for its hold time (3 to 300 s, its Properties); retriggering (its jumper at H), OUT stays at 1 while they move and for its hold time after; single (L), it falls after its hold time. Then it is blind for 2.5 s. Its minute of warming up at power-on is not simulated.':
    'Um sensor de movimento (PIR): alguém a mexer-se à sua frente (prima e mantenha premida a sua cúpula ao experimentá-lo: a sua entrada, uma entrada do HDL) põe OUT a 1 durante o seu tempo ativo (3 a 300 s, nas suas Propriedades); redisparável (o seu jumper em H), OUT fica a 1 enquanto se mexem e durante o tempo ativo depois disso; simples (L), desce ao fim do tempo ativo. Depois fica cego durante 2,5 s. O seu minuto de aquecimento ao ligar não é simulado.',
  // an SD card on SPI (#5477, core/circuit-sd.js)
  'SD card module (SPI, microSD)': 'Módulo de cartão SD (SPI, microSD)',
  'A microSD card module with a 32 MB SDHC card, on SPI (mode 0: MOSI read on SCK\'s rise; MISO released while CS is high): after 74 clocks or more with CS high, the SD protocol\'s commands: CMD0, CMD8, CMD55 + ACMD41 (idle, then ready), CMD58, CMD17 (a 512-byte block read) and CMD24 (a block written), by block number. Its blocks are empty at first; those written are kept while trying it, shown with its state. Not a port of the HDL.':
    'Um módulo de cartão microSD com um cartão SDHC de 32 MB, em SPI (modo 0: MOSI lido na subida de SCK; MISO solto enquanto CS está a 1): depois de 74 relógios ou mais com CS a 1, os comandos do protocolo SD: CMD0, CMD8, CMD55 + ACMD41 (em espera, depois pronto), CMD58, CMD17 (um bloco de 512 bytes lido) e CMD24 (um bloco escrito), pelo número do bloco. Os seus blocos começam vazios; os escritos ficam guardados enquanto o experimenta, mostrados com o seu estado. Não é um porto do HDL.',
  // a stepper motor on its driver board (#5476, core/circuit-stepper.js)
  'Stepper motor (28BYJ-48, ULN2003 board)': 'Motor passo-a-passo (28BYJ-48, placa ULN2003)',
  'A geared stepper motor (28BYJ-48) on its ULN2003 board: IN1 to IN4 at 1 turn on its coils A to D (its LEDs), and the coils on pull its rotor: in the order A, AB, B, BC, C, CD, D, DA (half steps, or A, B, C, D: full steps) its shaft turns clockwise, the other way anticlockwise; 4096 half steps a turn of its shaft (its gearbox, 1:64), one every 1 ms at most. A jump it cannot follow (the opposite coil) is said. Not a port of the HDL.':
    'Um motor passo-a-passo com redutor (28BYJ-48) na sua placa ULN2003: IN1 a IN4 a 1 ligam as suas bobinas A a D (os seus LEDs), e as bobinas ligadas puxam o rotor: na ordem A, AB, B, BC, C, CD, D, DA (meios passos, ou A, B, C, D: passos inteiros) o eixo roda no sentido horário, na ordem inversa no anti-horário; 4096 meios passos por volta do eixo (o seu redutor, 1:64), no máximo um a cada 1 ms. Um salto que não consegue seguir (a bobina oposta) é assinalado. Não é um porto do HDL.',
  // a rotary encoder (#5451, core/circuit-encoder.js)
  'Rotary encoder (KY-040)': 'Codificador rotativo (KY-040)',
  'A rotary encoder module (KY-040), 20 detents a turn: turning it joins CLK (A) and DT (B) to GND in quadrature, A first clockwise, B first anticlockwise, both open at each detent (its 10 kΩ pull-ups hold them high); pushing its knob joins SW to GND (no pull-up: the program\'s). A program counts the edges of A, reading B. Its turns and its switch are inputs of the HDL (ENC1_A, ENC1_B, ENC1_SW).':
    'Um módulo codificador rotativo (KY-040), 20 posições por volta: rodá-lo liga CLK (A) e DT (B) ao GND em quadratura, primeiro A no sentido horário, primeiro B no anti-horário, ambos abertos em cada posição (os seus pull-ups de 10 kΩ mantêm-nos a 1); premir o botão liga SW ao GND (sem pull-up: o do programa). Um programa conta as transições de A, lendo B. As suas voltas e o seu botão são entradas do HDL (ENC1_A, ENC1_B, ENC1_SW).',
  'A membrane keypad, 16 keys in 4 rows and 4 columns: a key joins its row (R1…R4) to its column (C1…C4) while pressed. A program scans it: its rows driven low one at a time, its columns pulled up and read. Each key an input of the HDL.':
    'Um teclado de membrana, 16 teclas em 4 linhas e 4 colunas: uma tecla liga a sua linha (R1…R4) à sua coluna (C1…C4) enquanto premida. Um programa varre-o: as linhas postas a 0 uma de cada vez, as colunas com pull-up e lidas. Cada tecla é uma entrada do HDL.',
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
const TITLE = { 'Arduino Uno': 'Arduino Uno', 'Arduino Nano': 'Arduino Nano', 'Digilent Basys2': 'Digilent Basys2', 'Digilent Nexys2': 'Digilent Nexys2',
  'Half breadboard': 'Meia placa de ensaio', 'Full breadboard (its rails split in the middle)': 'Placa de ensaio inteira (as linhas de alimentação cortadas ao meio)',
  'Power supply (+5 V, GND)': 'Fonte de alimentação (+5 V, GND)', 'Logic switch': 'Interruptor lógico',
  'Push button (momentary, normally open)': 'Botão de pressão (momentâneo, normalmente aberto)', 'Slide switch (SPDT)': 'Comutador deslizante (SPDT)',
  'DIP switch (4)': 'Interruptor DIP (4)', 'DIP switch (8)': 'Interruptor DIP (8)', 'Keypad 4×4 (matrix)': 'Teclado 4×4 (matricial)', 'Clock source': 'Fonte de relógio',
  'Pull-up (a weak 1)': 'Pull-up (um 1 fraco)', 'Pull-down (a weak 0)': 'Pull-down (um 0 fraco)', LED: 'LED',
  '7-segment display, common cathode': 'Mostrador de 7 segmentos, cátodo comum', '7-segment display, common anode': 'Mostrador de 7 segmentos, ânodo comum',
  'LED bar (10)': 'Barra de LEDs (10)', 'Character LCD 16×2 (HD44780)': 'LCD de caracteres 16×2 (HD44780)', 'Temperature sensor LM75 (I²C)': 'Sensor de temperatura LM75 (I²C)', 'Servo (SG90, PWM)': 'Servo (SG90, PWM)', 'Graphic OLED 128×64 (SSD1306, I²C)': 'OLED gráfico 128×64 (SSD1306, I²C)', 'Logic probe': 'Sonda lógica', 'Hex inverter': 'Seis inversores', 'Hex Schmitt-trigger inverter': 'Seis inversores Schmitt-trigger',
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
  // (a part's heading, U1: Logic switch; not I/O Pin Planning's Board: Digilent Basys2, its own field, #5396)
  [new RegExp(`^(?!Board: )([A-Za-z]\\w*): (${TITLES})$`), (m, id, t) => `${id}: ${title(t)}`],
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
  // its Check's errors and warnings (core/circuit-check.js, core/circuit-kicad-hdl.js checkModels, #5185)
  [/^A wire and a part are both named (\S+)$/, 'Um fio e uma peça têm ambos o nome $1'],
  [/^(.+) are on the same hole \((\S+)\) \((\S+)\)$/, (m, q, h, k) => `${pins(q)} estão no mesmo furo (${h}) (${k})`],
  [/^(.+) are on the same point \((\S+)\)$/, (m, q, k) => `${pins(q)} estão no mesmo ponto (${k})`],
  [/^(\S+) \((.+)\) is drawn only: it is not simulated and its pins drive nothing$/, '$1 ($2) só está desenhada: não é simulada e os seus pinos não comandam nada'],
  [/^The wire (\S+)'s (start|end) \((\S+)\) joins nothing$/, (m, w, e, k) => `${e === 'start' ? 'O início' : 'O fim'} do fio ${w} (${k}) não liga a nada`],
  [/^The circuit's name '(.*)' is not a valid HDL name$/, "O nome do circuito '$1' não é um nome válido do HDL"],
  [/^(\S+): no part '(.*)' in the library$/, "$1: não há nenhuma peça '$2' na biblioteca"],
  [/^A (\S+) has no id$/, 'Uma peça $1 não tem id'], [/^Two parts are named (\S+)$/, 'Há duas peças com o nome $1'],
  [/^(\S+): its label '(.*)' is a bus's bit: a part of one port only \(a switch, a button, a clock, an LED\) has one$/,
    "$1: a sua etiqueta '$2' é um bit de um barramento: só uma peça de um único porto (um interruptor, um botão, um relógio, um LED) o tem"],
  [/^(\S+): its label '(.*)' is not a valid HDL name$/, "$1: a sua etiqueta '$2' não é um nome válido do HDL"],
  [/^(\S+): its label '(.*)' is the circuit's name$/, "$1: a sua etiqueta '$2' é o nome do circuito"],
  [/^(\S+): its label '(.*)' is (\S+)'s too( \(.+\))?$/, "$1: a sua etiqueta '$2' é também a de $3$4"],
  [/^The bus (\S+) has no bit (\d+) \(its bits: (.+)\): its bits 0 to (\d+), each a part's$/, 'O barramento $1 não tem o bit $2 (os seus bits: $3): os seus bits de 0 a $4, cada um de uma peça'],
  [/^The bus (\S+): (\S+) is an (input|output), (\S+) an (input|output): a bus is one or the other$/, (m, b, x, k, y, l) => `O barramento ${b}: ${x} é ${IO[k]}, ${y} ${IO[l]}: um barramento é uma coisa ou a outra`],
  [/^The bus (\S+) is also (\S+)'s port$/, 'O barramento $1 é também o porto de $2'],
  [/^(.+) \(3-state\) and (.+) drive one net: a short whenever (one is|it is) enabled$/, (m, a, b, w) => `${pins(a)} (tri-state) e ${pins(b)} comandam uma rede: um curto-circuito sempre que ${w === 'one is' ? 'um estiver' : 'estiver'} habilitado`],
  [/^Short circuit: the supply's \+ and − are joined \((.+)\)$/, (m, n) => `Curto-circuito: o + e o − da fonte estão ligados (${pins(n)})`],
  [/^Short circuit: (.+) \(open collector\) on the supply's \+ rail: a short whenever (one is|it is) 0$/, (m, q, w) => `Curto-circuito: ${pins(q)} (coletor aberto) na linha + da fonte: um curto-circuito sempre que ${w === 'one is' ? 'um estiver' : 'estiver'} a 0`],
  [/^Short circuit: (.+) (drives?) the supply's ([+−]) rail$/, (m, q, d, r) => `Curto-circuito: ${pins(q)} ${d === 'drive' ? 'comandam' : 'comanda'} a linha ${r} da fonte`],
  [/^Short circuit: (.+) drive one net \(a short whenever they differ\)$/, (m, q) => `Curto-circuito: ${pins(q)} comandam uma rede (um curto-circuito sempre que forem diferentes)`],
  [/^(.+): open collector with no pull-up: the net floats while (they are|it is) off \(a 74LS input reads it high, an LED stays off\)$/,
    (m, q, w) => `${pins(q)}: coletor aberto sem pull-up: a rede flutua enquanto ${w === 'they are' ? 'estiverem desligados' : 'estiver desligado'} (uma entrada 74LS lê-a a 1, um LED fica apagado)`],
  [/^Short circuit while (\S+) is (pressed|on|off|turned)(?: \(its key (\S+)\)| \((its switch)\)| \(its ([AB]) contact closed\))?: it joins the supply's \+ and −$/,
    (m, p, w, k, s, c) => `Curto-circuito enquanto ${p} está ${HOW[w]}${k ? ` (a sua tecla ${k})` : s ? ' (o seu botão)' : c ? ` (o seu contacto ${c} fechado)` : ''}: liga o + e o − da fonte`],
  [/^(\S+) joins two driven nets while (pressed|on|off|turned)(?: \(its key (\S+)\)| \((its switch)\)| \(its ([AB]) contact closed\))? \((.+); (.+)\): one of its sides must be driven by nothing else$/,
    (m, p, w, k, s, c, a, b) => `${p} liga duas redes comandadas enquanto ${HOW[w]}${k ? ` (a sua tecla ${k})` : s ? ' (o seu botão)' : c ? ` (o seu contacto ${c} fechado)` : ''} (${pins(a)}; ${pins(b)}): um dos seus lados não pode ser comandado por mais nada`],
  [/^(\S+) \((.+)\) is powered the wrong way round: its (\S+) \(pin (\d+)\) on the supply's − and its (\S+) \(pin (\d+)\) on its \+$/, '$1 ($2) está alimentado ao contrário: o seu $3 (pino $4) no − da fonte e o seu $5 (pino $6) no +'],
  [/^(\S+) \((.+)\) is not powered: (.+)$/, (m, p, v, w) => `${p} (${v}) não está alimentado: ${w.replace(/its (\S+) \(pin (\d+)\) is not on the supply's ([+−])/g, 'o seu $1 (pino $2) não está no $3 da fonte').replace(/ and /g, ' e ')}`],
  [/^(\S+) pin (\d+) \((.+)\) floats while (the button (\S+) is released|no key of (\S+) is pressed|the switch of (\S+) is released|the ([AB]) contact of (\S+) is open|(\S+) is (off|on)): (a 74LS input reads high|a CMOS input reads X)$/,
    (m, p, n, q, w, b, kp, es, ec, ep, c, o, r) => `${p} pino ${n} (${q}) flutua enquanto ${b ? `o botão ${b} está solto` : kp ? `nenhuma tecla de ${kp} está premida` : es ? `o botão de ${es} está solto` : ec ? `o contacto ${ec} de ${ep} está aberto` : `${c} está ${HOW[o]}`}: ${READS[r]}`],
  [/^(\S+) pin (\d+) \((.+)\) is floating: (a 74LS input reads high|a CMOS input reads X)$/, (m, p, n, q, r) => `${p} pino ${n} (${q}) está a flutuar: ${READS[r]}`],
  // (a graphic OLED's lines, #5336)
  [/^(\S+)'s (SCL|SDA) \(pin (\d)\) has no pull-up: the I²C bus's lines are released high by a pull-up each$/, (m, p, n, k) => `O ${n} (pino ${k}) de ${p} não tem pull-up: as linhas do bus I²C são soltas a 1 por um pull-up cada`],
  // (a character LCD's RW, #5330)
  [/^(\S+)'s RW \(pin 5\) is not on GND: its reads are not simulated \(tie it low, as LiquidCrystal's wiring does\)$/, (m, p) => `O RW (pino 5) de ${p} não está no GND: as suas leituras não são simuladas (ligue-o a 0, como a ligação da LiquidCrystal)`],
  // (a buzzer, #5454: its checks and a tone no one hears)
  [/^(\S+) \((.+)\): its − \(pin (\d)\) is not on the supply's −: it never sounds$/, (m, p, v, k) => `${p} (${v}): o seu − (pino ${k}) não está no − da fonte: nunca soa`],
  [/^(\S+)'s \+ \(pin (\d)\) is driven by nothing: it stays silent$/, (m, p, k) => `O + (pino ${k}) de ${p} não é conduzido por nada: fica em silêncio`],
  [/^(\S+)'s ((?:IN\d, )*IN\d) (?:is|are) driven by nothing: it never turns$/, (m, p, ins) => `${ins} de ${p} não são conduzidos por nada: nunca roda`],
  [/^(\S+)'s ((?:IN\d, )*IN\d) (?:is|are) driven by nothing: its coils' cycle is not whole$/, (m, p, ins) => `${ins} de ${p} ${ins.includes(',') ? 'não são conduzidos' : 'não é conduzido'} por nada: o ciclo das suas bobinas não fica completo`],
  [/^(\S+): a jump of (\d) half steps: its rotor cannot follow it \(in order: A, AB, B, BC, C, CD, D, DA\)$/, (m, p, n) => `${p}: um salto de ${n} meios passos: o rotor não o consegue seguir (por ordem: A, AB, B, BC, C, CD, D, DA)`],
  [/^(\S+): steps ([\d.]+) ms apart: a 28BYJ-48 follows one every 1 ms at most, it stalls$/, (m, p, ms) => `${p}: passos a ${ms} ms uns dos outros: um 28BYJ-48 segue no máximo um a cada 1 ms, e fica parado`],
  [/^(\S+)'s ((?:SCK|MOSI|CS)(?:, (?:MOSI|CS))*) (?:is|are) driven by nothing: no host talks to it$/, (m, p, ins) => `${ins} de ${p} ${ins.includes(',') ? 'não são conduzidos' : 'não é conduzido'} por nada: nenhum anfitrião fala com ele`],
  [/^(\S+): only (\d+) clocks with CS high before its first command: an SD card needs 74 or more$/, (m, p, n) => `${p}: só ${n} relógios com CS a 1 antes do seu primeiro comando: um cartão SD precisa de 74 ou mais`],
  [/^card (off|idle|ready)$/, (m, s) => `cartão ${{ off: 'desligado', idle: 'em espera', ready: 'pronto' }[s]}`],
  [/^(\d+) written$/, (m, n) => `${n} escrito(s)`],
  [/^read block (\d+)$/, (m, n) => `bloco ${n} lido`],
  [/^wrote block (\d+)$/, (m, n) => `bloco ${n} escrito`],
  [/^(\S+): a tone of (\d+) Hz: a person hears 20 Hz to 20 kHz$/, (m, p, hz) => `${p}: um tom de ${hz} Hz: uma pessoa ouve de 20 Hz a 20 kHz`],
  [/^(\S+): a start of ([\d.]+) ms: a (DHT\d\d)'s is ([\d.]+) ms or more$/, (m, p, ms, d, min) => `${p}: um início de ${ms} ms: o de um ${d} é de ${min} ms ou mais`],
  [/^(\S+): read ([\d.]+) s after its last read or its power-on: a (DHT\d\d) answers once every (\d) s$/, (m, p, s, d, n) => `${p}: lido ${s} s depois da última leitura ou de ligado: um ${d} responde uma vez a cada ${n} s`],
  [/^(\S+)'s Trig \(pin (\d)\) is driven by nothing: it never measures$/, (m, p, k) => `O Trig (pino ${k}) de ${p} não é conduzido por nada: nunca mede`],
  [/^(\S+): a trigger of ([\d.]+) µs: an HC-SR04's is 10 µs or more$/, (m, p, us) => `${p}: um disparo de ${us} µs: o de um HC-SR04 é de 10 µs ou mais`],
  // (a servo's signal, #5347)
  [/^(\S+)'s signal \(pin (\d)\) is driven by nothing: its arm stays where it is$/, (m, p, k) => `O sinal (pino ${k}) de ${p} não é conduzido por nada: o seu braço fica onde está`],
  // (the analog parts' titles, #5382: as part-function.js says them)
  [/^Resistor$/, 'Resistência'], [/^Capacitor$/, 'Condensador'], [/^Potentiometer$/, 'Potenciómetro'],
  // (an LED with too much current, #5382)
  [/^(\S+?)( \(its LED (\d+)\))?: (\d+) mA through it, more than an LED takes \((\d+) mA\): a current-limiting resistor is missing in series \(about (\d+) Ω from 5 V\)$/,
    (m, p, x, k, i, max, r) => `${p}${x ? ` (o seu LED ${k})` : ''}: ${i} mA através dele, mais do que um LED aguenta (${max} mA): falta uma resistência limitadora de corrente em série (cerca de ${r} Ω a partir de 5 V)`],
  [/^(\S+) \((.+)\) joins nothing$/, (m, p, d) => `${p} (${CIRCUIT_PT[d] ?? title(d)}) não liga a nada`],
  [/^(\S+) never lights: its anode and its cathode are joined$/, '$1 nunca acende: o seu ânodo e o seu cátodo estão ligados'],
  [/^(\S+) never lights: it is the wrong way round \((.+)\)$/, (m, p, w) => `${p} nunca acende: está ao contrário (${w.replace("its anode on the supply's −", 'o seu ânodo no − da fonte').replace("its cathode on the supply's +", 'o seu cátodo no + da fonte')})`],
  [/^(\S+) never lights: its common cathode is on the supply's \+ \(a common anode display's place\)$/, '$1 nunca acende: o seu cátodo comum está no + da fonte (o lugar de um mostrador de ânodo comum)'],
  [/^(\S+) never lights: its common anode is on the supply's − \(a common cathode display's place\)$/, '$1 nunca acende: o seu ânodo comum está no − da fonte (o lugar de um mostrador de cátodo comum)'],
  // (a KiCad part modelled by a module of the project, #4283, #4284: `<id> (<value>): …`)
  [/^(\S+ \(.+?\)): no module '(.*)' in the project$/, "$1: não há nenhum módulo '$2' no projeto"],
  [/^(\S+ \(.+?\)): its module (\S+) cannot run in Try it: ([\s\S]+)$/, '$1: o seu módulo $2 não pode correr no Experimentar: $3'],   // (the simulator's reason as it is)
  [/^(\S+ \(.+?\)): its module (\S+) has no port (\S+) \(its pin (\S+)\)$/, '$1: o seu módulo $2 não tem nenhum porto $3 (o seu pino $4)'],
  [/^(\S+ \(.+?\)): its pin (\S+) \((.+)\) is an (input|output), its module (\S+)'s port (\S+) (an input|an output|\S+)$/,
    (m, p, n, q, k, d, x, l) => `${p}: o seu pino ${n} (${q}) é ${IO[k]}, o porto ${x} do seu módulo ${d} ${IO[l.replace(/^an /, '')] ?? l}`],
  [/^(\S+ \(.+?\)): its module (\S+)'s port (\S+) is (\d+) bits wide, a pin one$/, '$1: o porto $3 do seu módulo $2 tem $4 bits, um pino tem um'],
  [/^(\S+ \(.+?\)): its module (\S+)'s port (\S+) has no pin$/, '$1: o porto $3 do seu módulo $2 não tem pino'],
];
// (a list of pins, a net's: core/circuit-check.js pinText, core/circuit-net.js netText: "U1 1Y and U2 1Y", "U1 pin 14 (VCC)")
const pins = (s) => s.replace(/ pin (\d+) \(/g, ' pino $1 (').replace(/ and /g, ' e ').replace(/the supply's ([+−])/g, 'o $1 da fonte');
const IO = { input: 'uma entrada', output: 'uma saída' };
const HOW = { pressed: 'premido', on: 'ligado', off: 'desligado', turned: 'rodado' };
const READS = { 'a 74LS input reads high': 'uma entrada 74LS lê 1', 'a CMOS input reads X': 'uma entrada CMOS lê X' };
