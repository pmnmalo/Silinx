// Portuguese strings of the System editor (web/js/system-editor.js, system-side.js, system-draw.js, system-open.js,
// design-system.js, system-folders-ui.js, #4700; merged into the dictionary of i18n.js). The core's edit and check messages are said in the
// console as the MCP server says them.
import { t } from './i18n.js';   // (an error's own text, read only inside its pattern's function: no cycle at load time)

export const SYSTEM_PT = {
  // toolbar
  'Arduino Uno': 'Arduino Uno', 'Arduino Nano': 'Arduino Nano', 'Terminal': 'Terminal', 'Link': 'Ligação',
  'Click the canvas to add an FPGA node: a module of the project on a board': 'Clique na tela para acrescentar um nó FPGA: um módulo do projeto numa placa',
  'Click the canvas to add an Arduino Uno': 'Clique na tela para acrescentar um Arduino Uno', 'Click the canvas to add an Arduino Nano': 'Clique na tela para acrescentar um Arduino Nano',
  'ESP32': 'ESP32', 'Click the canvas to add an ESP32 DevKitC: MicroPython, behavioural, its program a .py': 'Clique na tela para acrescentar uma ESP32 DevKitC: MicroPython, comportamental, o seu programa um .py',   // (#5495)
  'Pico': 'Pico', 'Click the canvas to add a Raspberry Pi Pico: an RP2040 running MicroPython, its program a .py': 'Clique na tela para acrescentar um Raspberry Pi Pico: um RP2040 com MicroPython, o seu programa um .py',   // (#5494)
  'Program (.py)': 'Programa (.py)', 'a .py of the project, run by MicroPython': 'um .py do projeto, corrido pelo MicroPython',
  'MQTT Broker': 'Broker MQTT', 'MQTT broker': 'broker MQTT', "Click the canvas to add an MQTT broker: the Pico Ws' messages, published and subscribed": 'Clique na tela para acrescentar um broker MQTT: as mensagens dos Pico W, publicadas e subscritas',   // (#5500)
  'Every client\'s MQTT link ends here': 'A ligação MQTT de cada cliente termina aqui', "Its link to an MQTT broker: its program's network and umqtt.simple": 'A sua ligação a um broker MQTT: o network e o umqtt.simple do seu programa',
  '+ MQTT': '+ MQTT', 'Add its MQTT interface: its link to a broker': 'Acrescentar a sua interface MQTT: a sua ligação a um broker',
  'MicroPython': 'MicroPython', 'CircuitPython': 'CircuitPython', 'the Python firmware the Pico runs': 'o firmware de Python que o Pico corre',   // (#5697)
  'a .py of the project, run by CircuitPython as its code.py': 'um .py do projeto, corrido pelo CircuitPython como o seu code.py',
  'Explorer 16/32': 'Explorer 16/32', 'Click the canvas to add an Explorer 16/32: a PIC24FJ1024GB610, its firmware a .hex': 'Clique na tela para acrescentar uma Explorer 16/32: um PIC24FJ1024GB610, o seu programa um .hex',
  'Click the canvas to add a serial terminal': 'Clique na tela para acrescentar um terminal série',
  'Click an interface, then an interface of another node of its kind': 'Clique numa interface e depois numa interface do mesmo tipo de outro nó',
  'Check the System for errors and warnings': 'Verificar erros e avisos do Sistema',
  // side panel
  'System': 'Sistema', 'Check System': 'Verificar Sistema', 'View/Edit System': 'Ver/Editar Sistema',   // (the Processes pane, #5414)
  'View/Edit Drawing': 'Ver/Editar Desenho',   // (a System's FPGA module's, #5443)
  'Implement System': 'Implementar Sistema', 'Synthesize': 'Sintetizar',   // (every FPGA node on its own board; a node's, #5446)
  'Build Plan': 'Plano de Construção', 'Build All': 'Construir Tudo',   // (the System's build plan and its nodes built, #5489)
  'Program All': 'Programar Tudo', 'Program Node': 'Programar Nó', 'Choose the Board': 'Escolher a Placa', 'Skip': 'Saltar',   // (its nodes on their boards, #5489)
  'No connected board was found by the local server.': 'O servidor local não encontrou nenhuma placa ligada.',   // (an Arduino over Web Serial, #5448)
  'Connected Boards': 'Placas Ligadas', 'USB id': 'Identificador USB', 'USB serial': 'Número de série USB',   // (its nodes' boards by their USB id, #5489)
  "vendor:product, hexadecimal (empty: the board's)": 'fabricante:produto, em hexadecimal (vazio: o da placa)',
  'its board told apart from another of the same kind': 'distingue a sua placa de outra do mesmo tipo',
  'Compile Firmware': 'Compilar Firmware', 'A process is already running (use Stop to cancel it)': 'Já está um processo em curso (use Parar para o cancelar)',   // (an Arduino node's sketch to its .hex, #5503)
  'Id': 'Identificador', 'Module': 'Módulo', 'Board': 'Placa', 'Variant': 'Variante', "(the board's)": '(a da placa)',
  'Firmware': 'Programa (firmware)', 'a .hex or an .elf of the project': 'um .hex ou um .elf do projeto', "a .hex of the project (XC16's)": 'um .hex do projeto (do XC16)', '(none)': '(nenhum)',
  '+ UART': '+ UART', '+ GPIO': '+ GPIO',
  'Add a UART interface: its TX and RX ports': 'Acrescentar uma interface UART: os portos TX e RX',
  'Add GPIO wires: their ports and direction': 'Acrescentar fios GPIO: os portos e a direção',
  "Add GPIO wires: the board's pins and their direction": 'Acrescentar fios GPIO: os pinos da placa e a direção',
  'TX (an output of the module)': 'TX (uma saída do módulo)', 'RX (an input of the module)': 'RX (uma entrada do módulo)',
  // an SPI bus (#5214)
  '+ SPI': '+ SPI', 'Add an SPI bus, the peripheral: its SCK, MOSI, MISO and SS ports': 'Acrescentar um barramento SPI, o periférico: os seus portos SCK, MOSI, MISO e SS',
  "Add the board's SPI bus, the master: SCK D13, MOSI D11, MISO D12, SS D10": 'Acrescentar o barramento SPI da placa, o mestre: SCK D13, MOSI D11, MISO D12, SS D10',
  'SCK (an input of the module)': 'SCK (uma entrada do módulo)', 'MOSI (an input)': 'MOSI (uma entrada)', 'MISO (an output)': 'MISO (uma saída)', 'SS (an input)': 'SS (uma entrada)',
  'SCK rate (Hz)': 'Ritmo do SCK (Hz)', 'Mode': 'Modo', "at least the program's: 125000 at SPI_CLOCK_DIV128": 'pelo menos o do programa: 125000 com SPI_CLOCK_DIV128',
  // an I²C bus (#5214)
  '+ I²C': '+ I²C', 'Add an I²C bus, the peripheral: its SCL port and its SDA, an inout port': 'Acrescentar um barramento I²C, o periférico: o seu porto SCL e o seu SDA, um porto inout',
  "Add the board's I²C bus (Wire), the master: SCL A5, SDA A4": 'Acrescentar o barramento I²C da placa (Wire), o mestre: SCL A5, SDA A4',
  'SCL (an input of the module)': 'SCL (uma entrada do módulo)', 'SDA (an inout port)': 'SDA (um porto inout)',
  'SCL rate (Hz)': 'Ritmo do SCL (Hz)', "at least the program's: 100000 with Wire": 'pelo menos o do programa: 100000 com Wire',
  'Baud': 'Débito (baud)', 'Frame': 'Trama', 'data bits, parity, stop bits: 8N1, 7E1…': 'bits de dados, paridade, bits de paragem: 8N1, 7E1…',
  'Pins': 'Pinos', "the module's ports, a bus's bit as led<0>": 'os portos do módulo, um bit de um barramento como led<0>', "the board's pins: D2, A0…": 'os pinos da placa: D2, A0…', "the board's pins: RA0, RD6…": 'os pinos da placa: RA0, RD6…',
  'Direction': 'Direção', 'in': 'in', 'out': 'out', 'Remove Interface': 'Remover Interface', 'Remove the interface and its link': 'Remover a interface e a sua ligação',
  // the simulation view (#4701)
  'Try the System out: its nodes run together, its links decoded, its waves': 'Experimentar o Sistema: os nós a correr juntos, as ligações descodificadas, as ondas',
  '▶ Run': '▶ Correr', '⏸ Pause': '⏸ Pausa', 'Run 100 ms': 'Correr 100 ms', 'Restart': 'Reiniciar', 'Waves': 'Ondas',
  'Run the System until Pause': 'Correr o Sistema até Pausa', 'Run the System for 100 ms': 'Correr o Sistema durante 100 ms',
  'Restart the System from time 0 (its modules compiled again)': 'Reiniciar o Sistema no tempo 0 (os módulos compilados de novo)',
  "Show the System's waves in the waveform viewer": 'Mostrar as ondas do Sistema no visualizador de formas de onda',
  'Compiling…': 'A compilar…', 'Type a line, Enter sends it': 'Escreva uma linha, Enter envia-a',
  'change(s)': 'alteração(ões)',
  // the Wiring view (#5216)
  'Wiring': 'Fios', "Show each link pin by pin, from one board's pin to the other's, with its levels": 'Mostrar cada ligação pino a pino, de um pino de uma placa ao da outra, com os seus níveis',
  'No wires: no link joins two resolved interfaces': 'Sem fios: nenhuma ligação junta duas interfaces resolvidas',
  // the System Emulator (#5212)
  'Emulate': 'Emular', 'Emulate the System: its boards side by side, interactive, in real time': 'Emular o Sistema: as suas placas lado a lado, interativas, em tempo real',
  // (an FPGA node's constraints file, #5581: web/js/system-constraints-ui.js, web/js/system-side.js)
  'Its module\'s ports on its board\'s pins, written to its constraints file': 'As portas do seu módulo nos pinos da sua placa, escritas no seu ficheiro de restrições',
  'A node\'s: its I/O Pin Planning in the tree below': 'De um nó: o seu Planeamento de Pinos de E/S na árvore abaixo',
  'Each FPGA node\'s model:': 'O modelo de cada nó FPGA:',
  // (the System Emulator's toolbar, #5613: web/js/system-emu-view.js)
  'Run the System at its rate until Pause': 'Correr o Sistema ao seu ritmo até Pausa', 'Rate:': 'Ritmo:',
  'Advance one clock cycle of its FPGA node (a System of several: one step of its scheduler, 100 µs)': 'Avançar um ciclo de relógio do seu nó FPGA (num Sistema de vários: um passo do seu escalonador, 100 µs)',
  'Power-cycle the boards: restart the System from time 0 (its modules compiled again)': 'Desligar e ligar as placas: recomeçar o Sistema do tempo 0 (os seus módulos compilados de novo)',
  'The emulation\'s rate against real time': 'O ritmo da emulação face ao tempo real',
  // (the Simulate task's tree of a System, #5581: web/js/system-simulate-ui.js)
  'Simulate the System: Simulate System runs its nodes together, a node\'s Simulate Node that node alone; the run opens here.': 'Simular o Sistema: Simular o Sistema corre os seus nós juntos, Simular o Nó de um nó corre esse nó sozinho; a execução abre aqui.',
  'Simulate System': 'Simular o Sistema', 'Simulate Node': 'Simular o Nó', 'Simulation Properties…': 'Propriedades da Simulação…',
  'Simulation Properties': 'Propriedades da Simulação', 'The nodes Simulate System runs:': 'Os nós que Simular o Sistema corre:',
  'Run time (ms):': 'Tempo de execução (ms):', 'Stimulus file:': 'Ficheiro de estímulos:', 'The run time: from 1 to 10000 ms': 'O tempo de execução: de 1 a 10000 ms',
  // (the Emulate task's tree of a System, #5581: web/js/system-emulate-ui.js)
  'Emulate Node': 'Emular o Nó', 'Emulation Properties…': 'Propriedades da Emulação…', 'Emulation Properties': 'Propriedades da Emulação',
  'The nodes Emulate System runs:': 'Os nós que Emular o Sistema corre:', 'Tick at least one node': 'Marque pelo menos um nó',
  'Emulate System': 'Emular o Sistema',
  'Terminals': 'Terminais', '☰ Terminals': '☰ Terminais', 'Show / hide the terminals panel': 'Mostrar / ocultar o painel dos terminais',
  'Collapse the terminals panel': 'Recolher o painel dos terminais', 'Expand the terminals panel': 'Expandir o painel dos terminais',
  // (a terminal joined to a real board over Web Serial, #5449: web/js/system-serial-ui.js)
  'Real Board…': 'Placa Real…', 'Disconnect': 'Desligar', 'Give the terminal back to the emulation': 'Devolver o terminal à emulação',
  "Join this terminal to a real board's USB serial port (Web Serial), at its link's baud and frame": 'Ligar este terminal à porta série USB de uma placa real (Web Serial), com o baud e a trama da sua ligação',
  'LED L (D13)': 'LED L (pino D13)', 'Power': 'Alimentação',
  // an Explorer 16/32 (#5484)
  'Potentiometer R6 (AN5): 0 to 3.3 V': 'Potenciómetro R6 (AN5): 0 a 3,3 V', 'Temperature sensor TC1047A (AN4), °C': 'Sensor de temperatura TC1047A (AN4), °C',
  'LCD 16x2 (the PMP: PMD0-7 RE0-RE7, RS RB15, E RD4)': 'LCD 16x2 (o PMP: PMD0-7 RE0-RE7, RS RB15, E RD4)',
  // a register map (#5288)
  'Register Map': 'Mapa de Registos', 'register map': 'mapa de registos', 'Generated from the register map': 'Gerado a partir do mapa de registos',
  '+ Register': '+ Registo', 'Add a register after the last one': 'Acrescentar um registo a seguir ao último', 'Remove the selected register': 'Remover o registo selecionado',
  'The bus the microcontroller reads and writes the registers on': 'O barramento em que o microcontrolador lê e escreve os registos',
  'Address': 'Endereço', 'The I²C address of the FPGA (7 bits: 0x08 to 0x77)': 'O endereço I²C da FPGA (7 bits: 0x08 a 0x77)',
  'Check the register map: its names, addresses, widths and resets': 'Verificar o mapa de registos: os nomes, endereços, larguras e valores iniciais',
  'Header': 'Cabeçalho', "Write the Arduino's header of the map (firmware/<name>.h): its addresses, a read and a write for each register": 'Escrever o cabeçalho do Arduino do mapa (firmware/<nome>.h): os endereços, uma leitura e uma escrita para cada registo',
  'Access': 'Acesso', 'Strobe': 'Impulso', 'A pulse <name>_wr, one clock cycle, when its last byte is written': 'Um impulso <nome>_wr, de um ciclo de relógio, quando o seu último byte é escrito',
  'Check Register Map': 'Verificar o Mapa de Registos',
  // the drawing
  'no interface': 'sem interface', 'Serial terminal': 'Terminal série', 'no circuit': 'sem circuito',
  // (a circuit node, #5215)
  'Circuit': 'Circuito', 'Click the canvas to add a circuit node: a circuit of the project between the boards, its boards the nodes their labels name': 'Clique na tela para acrescentar um nó circuito: um circuito do projeto entre as placas, as suas placas os nós que as suas etiquetas nomeiam',
  'a .circ.json of the project: its boards are the nodes their labels name': 'um .circ.json do projeto: as suas placas são os nós que as suas etiquetas nomeiam', 'no module': 'sem módulo', 'no firmware': 'sem firmware', 'no board': 'sem placa',
  // (a removed node's folder, #5488: web/js/system-folders-ui.js)
  'Remove Node': 'Remover Nó',
  'Not made: its file is not in the project folder': 'Não gerado: o seu ficheiro não está na pasta do projeto',
  "its run's time: from 0 to 10000 ms (10 s)": 'o tempo da sua corrida: de 0 a 10000 ms (10 s)',   // (a Simulation Properties' refusal, #5652)
};
export const SYSTEM_PT_PATTERNS = [
  // (Program All / Program Node's board picked by hand, #5489: web/js/system-program-ui.js)
  [/^The board to program the node (\w+) on:$/, 'A placa onde programar o nó $1:'],
  [/^Button (S\d) \((R[A-G]\d+)\)$/, 'Botão $1 ($2)'], [/^Button (S\d): its pin is a link's$/, 'Botão $1: o seu pino é de uma ligação'],
  [/^LED (D\d+) \((R[A-G]\d+)\)$/, 'LED $1 ($2)'], [/^(PIC24\w+), its 8 MHz crystal$/, '$1, o seu cristal de 8 MHz'],
  // (Find Boards in the browser edition, #5586: web/js/system-build-ui.js)
  [/^(.+): the local server lists the boards connected to its computer \(the browser edition sees only a board it was given, when it programs it\)$/,
    '$1: o servidor local lista as placas ligadas ao seu computador (a edição para browser só vê uma placa que lhe foi dada, quando a programa)'],
  [/^(.+): a System's boards are programmed by the local server for now \(the browser edition programs an FPGA project's board\)$/,
    '$1: por agora, as placas de um System são programadas pelo servidor local (a edição para browser programa a placa de um projeto FPGA)'],
  [/^the System project '(.+)' has no System document \(\.sys\.json\)$/, "o projeto System '$1' não tem documento System (.sys.json)"],
  // (the System Emulator's panel, web/js/system-emulate-ui.js)
  [/^Emulation Properties: ([\s\S]+)$/, 'Propriedades da emulação: $1'],
  // (an FPGA node's constraints, #5601: web/js/system-constraints-ui.js)
  [/^([A-Za-z]\w*): an FPGA node with no module$/, '$1: um nó FPGA sem módulo'],
  [/^([A-Za-z]\w*): no FPGA board '(.*)'$/, "$1: não há a placa FPGA '$2'"],
  [/^no FPGA node '(.+)' in the System$/, "não há o nó FPGA '$1' no System"],
  // (a CPU node's drawing's last badge, #5488: web/js/design.js)
  [/^The node's base language: (.+)$/, 'A linguagem de base do nó: $1'],
  // (a CPU node's drawing's [C], #5486: web/js/design-cpu.js)
  [/^Not made: it has errors: (.+)$/, 'Não gerado: tem erros: $1'], [/^Not updated: (.+)$/, 'Não atualizado: $1'],
  [/^Delete the folder '(.+)' of the removed node ([A-Za-z]\w*) and the (\d+) file\(s\) in it from the project\?(\n\(They are moved to the workspace's \.trash folder, from where you can move them back\.\))?\n\n([\s\S]*)$/,
    (m, dir, id, n, trash, list) => `Apagar a pasta '${dir}' do nó removido ${id} e o(s) ${n} ficheiro(s) que contém do projeto?${trash ? '\n(São movidos para a pasta .trash da área de trabalho, de onde os pode repor.)' : ''}\n\n${list}`],
  [/^(FPGA|Microcontroller|Serial terminal|Circuit) ([A-Za-z]\w*)$/, (m, k, id) => `${{ FPGA: 'FPGA', Microcontroller: 'Microcontrolador', 'Serial terminal': 'Terminal série', Circuit: 'Circuito' }[k]} ${id}`],
  [/^Link ([A-Za-z]\w*)$/, 'Ligação $1'], [/^Waves \((.+)\)$/, 'Ondas ($1)'],
  [/^Emulate \((.+)\)$/, 'Emular ($1)'], [/^Simulate \((.+)\)$/, 'Simular ($1)'], [/^1\/(\d+) of real time$/, '1/$1 do tempo real'],
  [/^(\S+): (Behavioral \(RTL\)|Post-Synthesis|Post-Translate|Post-Map|Post-Place & Route)$/, (m, n, x) => `${n}: ${{ 'Behavioral (RTL)': 'Comportamental (RTL)', 'Post-Synthesis': 'Pós-Síntese', 'Post-Translate': 'Pós-Translate', 'Post-Map': 'Pós-Map', 'Post-Place & Route': 'Pós-Place & Route' }[x]}`], [/^Simulate \((.+)\)$/, 'Simular ($1)'],
  // (the System's run's time, its Simulation Properties', #5581)
  [/^Run (\d+) ms$/, 'Correr $1 ms'], [/^Run the System for (\d+) ms$/, 'Correr o Sistema durante $1 ms'], [/^New: (\S+)$/, 'Novo: $1'],
  [/^Simulation Properties: (\S+) made, the System's stimulus file \(its controls and the text typed, at their times\)\.$/,
    'Propriedades da Simulação: $1 criado, o ficheiro de estímulos do Sistema (os seus controlos e o texto escrito, nos seus tempos).'],
  [/^Simulation Properties: Simulate System runs (every node|.+?) for (\d+) ms(, its stimulus (\S+))?$/,
    (m, w, ms, x, f) => `Propriedades da Simulação: Simular o Sistema corre ${w === 'every node' ? 'todos os nós' : w} durante ${ms} ms${f ? `, os seus estímulos ${f}` : ''}`],
  // (an FPGA node's constraints file, #5581)
  [/^I\/O Pin Planning \((\S+)\)$/, 'Planeamento de Pinos de E/S ($1)'],
  [/^(\S+): no constraints file (\S+) yet: its module's ports are on no pin of its board \(its I\/O Pin Planning\)$/,
    '$1: ainda sem ficheiro de restrições $2: as portas do seu módulo não estão em nenhum pino da sua placa (o seu Planeamento de Pinos de E/S)'],
  [/^(\S+): its constraints file (\S+) cannot be read: (.+)$/, '$1: o seu ficheiro de restrições $2 não pode ser lido: $3'],
  [/^(\S+): its pins (written to|set in) its constraints file (\S+)$/, (m, n, how, f) => `${n}: os seus pinos ${how === 'written to' ? 'escritos no' : 'definidos no'} seu ficheiro de restrições ${f}`],
  [/^(\S+): (\S+): its pins (written to|set in) its constraints file (\S+) \(a System's pins are in its FPGA nodes' constraints files now\)\.$/,
    (m, d, n, how, f) => `${d}: ${n}: os seus pinos ${how === 'written to' ? 'escritos no' : 'definidos no'} seu ficheiro de restrições ${f} (os pinos de um Sistema estão agora nos ficheiros de restrições dos seus nós FPGA).`],
  [/^(\S+): its module's ports are on no pin of its board \(its I\/O Pin Planning\)$/, '$1: as portas do seu módulo não estão em nenhum pino da sua placa (o seu Planeamento de Pinos de E/S)'],
  // (the Emulate task's tree, #5581: a node's firmware and circuit, the System's row, a terminal's; what runs)
  [/^(\S+) \(System\)$/, '$1 (Sistema)'], [/^(\S+) \(terminal\)$/, '$1 (terminal)'],
  [/^(\S+) runs with the nodes it is linked to$/, '$1 corre com os nós a que está ligado'],
  // (the Implement task's tree, #5581's part 4: a firmware given, a node Silinx does not program yet)
  [/^Firmware: (\S+)$/, 'Programa (firmware): $1'], [/^(\S+): its firmware (\S+), made outside Silinx: nothing to build$/, '$1: o seu firmware $2, feito fora do Silinx: nada a construir'],
  [/^(\S+): a PIC24 is not programmed by Silinx yet: load its (\S+) with MPLAB IPE$/, '$1: um PIC24 ainda não é programado pelo Silinx: carregue o seu $2 com o MPLAB IPE'],
  [/^(\S+): a MicroPython node is not programmed by Silinx yet: copy its \.py files with mpremote$/, '$1: um nó MicroPython ainda não é programado pelo Silinx: copie os seus ficheiros .py com o mpremote'],
  [/^Emulation Properties: Emulate System runs (every node|.+?)(; (.+))?$/, (m, w, x, models) => `Propriedades da Emulação: Emular o Sistema corre ${w === 'every node' ? 'todos os nós' : w}${models ? `; ${models.replace(/(\S+) on its (.+?) model/g, (y, id, mo) => `${id} no seu modelo ${{ 'Behavioral (RTL)': 'Comportamental (RTL)', 'Post-Synthesis': 'Pós-Síntese', 'Post-Translate': 'Pós-Translate', 'Post-Map': 'Pós-Map', 'Post-Place & Route': 'Pós-Place & Route' }[mo] ?? mo}`)}` : ''}`],
  // (an FPGA node's model, #5612)
  [/^(Emulate System|Emulate Node \S+): (\S+)'s (.+) model is not made yet: its flow makes it first\.$/, '$1: o modelo $3 de $2 ainda não está feito: o seu fluxo fá-lo primeiro.'],
  [/^(Emulate System|Emulate Node \S+): (\S+)'s (.+) model could not be made$/, '$1: o modelo $3 de $2 não pôde ser feito'],
  [/^(Emulate System|Emulate Node \S+): (\S+)'s flow made no (.+) model$/, '$1: o fluxo de $2 não fez nenhum modelo $3'], [/^(\d+)% of real time$/, '$1% do tempo real'],
  // (a node's Implement in the browser edition: web/js/system-implement-ui.js, #5446)
  [/^(.+): a System's node is implemented by the local server for now \(the browser edition implements an FPGA project\)$/,
    '$1: um nó de um Sistema é implementado pelo servidor local, por agora (a edição do browser implementa um projeto FPGA)'],
  // (a node's firmware compiled in the browser edition: web/js/system-firmware-ui.js, #4695 phase 5)
  [/^(.+): a node's firmware is compiled by the local server's arduino-cli \(the browser edition has no compiler\): give the node a \.hex made elsewhere, the Arduino IDE's Export Compiled Binary$/,
    '$1: o programa (firmware) de um nó é compilado pelo arduino-cli do servidor local (a edição do browser não tem compilador): dê ao nó um .hex feito noutro lado, o Export Compiled Binary do Arduino IDE'],
  // (a PIC24 node's in the browser edition, #5482)
  [/^(.+): a PIC24 node's firmware is compiled by XC16, on the local server or its ISE machine \(the browser edition has no compiler\): give the node the \.hex MPLAB X built$/,
    '$1: o programa (firmware) de um nó PIC24 é compilado pelo XC16, no servidor local ou na sua máquina do ISE (a edição do browser não tem compilador): dê ao nó o .hex que o MPLAB X construiu'],
  // (the register map's Header, its map in error: web/js/drawings-regs.js)
  [/^([^:]+): (.+): no header written$/, '$1: $2: cabeçalho não escrito'],
  [/^(\d+) registers? · (\d+) bytes?$/, (m, n, b) => `${n} ${n === '1' ? 'registo' : 'registos'} · ${b} byte${b === '1' ? '' : 's'}`],
  [/^(\d+) wires? · (\d+) links?$/, (m, n, l) => `${n} ${n === '1' ? 'fio' : 'fios'} · ${l} ${l === '1' ? 'ligação' : 'ligações'}`],
  [/^(\d+) nodes? · (\d+) links?$/, (m, n, l) => `${n} ${n === '1' ? 'nó' : 'nós'} · ${l} ${l === '1' ? 'ligação' : 'ligações'}`],
  // (the System's simulation refused, its Simulation Properties' refusals, #5652: after the Simulation Properties' own lines)
  [/^cannot simulate (\S+): ([\s\S]*)$/, (m, p, e) => `não foi possível simular ${p}: ${t(e)}`],
  [/^(\S+): a stimulus file is a \.stim\.json$/, '$1: um ficheiro de estímulos é um .stim.json'], [/^(\S+): no such file in the project$/, '$1: não existe esse ficheiro no projeto'],
  [/^Simulation Properties: ([\s\S]+)$/, (m, e) => `Propriedades da Simulação: ${t(e)}`],
  // (Program All / Program Node refused, web/js/system-program-ui.js)
  [/^(Program All|Program Node): the System is not open$/, (m, n) => `${t(n)}: o Sistema não está aberto`],
  [/^(Program All|Program Node): no node '([^']+)' to program in the System$/, (m, n, id) => `${t(n)}: nenhum nó '${id}' para programar no Sistema`],
];
