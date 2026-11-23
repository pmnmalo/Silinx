// Portuguese strings of the System editor (web/js/system-editor.js, system-side.js, system-draw.js, system-open.js,
// design-system.js, #4700; merged into the dictionary of i18n.js). The core's edit and check messages are said in the
// console as the MCP server says them.
export const SYSTEM_PT = {
  // toolbar
  'Arduino Uno': 'Arduino Uno', 'Arduino Nano': 'Arduino Nano', 'Terminal': 'Terminal', 'Link': 'Ligação',
  'Click the canvas to add an FPGA node: a module of the project on a board': 'Clique na tela para acrescentar um nó FPGA: um módulo do projeto numa placa',
  'Click the canvas to add an Arduino Uno': 'Clique na tela para acrescentar um Arduino Uno', 'Click the canvas to add an Arduino Nano': 'Clique na tela para acrescentar um Arduino Nano',
  'Click the canvas to add a serial terminal': 'Clique na tela para acrescentar um terminal série',
  'Click an interface, then an interface of another node of its kind': 'Clique numa interface e depois numa interface do mesmo tipo de outro nó',
  'Check the System for errors and warnings': 'Verificar erros e avisos do Sistema',
  // side panel
  'System': 'Sistema', 'Check System': 'Verificar Sistema', 'Id': 'Identificador', 'Module': 'Módulo', 'Board': 'Placa', 'Variant': 'Variante', "(the board's)": '(a da placa)',
  'Firmware': 'Programa (firmware)', 'a .hex or an .elf of the project': 'um .hex ou um .elf do projeto', '(none)': '(nenhum)',
  'Pins of the board': 'Pinos da placa', '+ UART': '+ UART', '+ GPIO': '+ GPIO',
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
  'Pins': 'Pinos', "the module's ports, a bus's bit as led<0>": 'os portos do módulo, um bit de um barramento como led<0>', "the board's pins: D2, A0…": 'os pinos da placa: D2, A0…',
  'Direction': 'Direção', 'in': 'in', 'out': 'out', 'Remove Interface': 'Remover Interface', 'Remove the interface and its link': 'Remover a interface e a sua ligação',
  // the simulation view (#4701)
  'Try the System out: its nodes run together, its links decoded, its waves': 'Experimentar o Sistema: os nós a correr juntos, as ligações descodificadas, as ondas',
  '▶ Run': '▶ Correr', '⏸ Pause': '⏸ Pausa', 'Run 100 ms': 'Correr 100 ms', 'Restart': 'Reiniciar', 'Waves': 'Ondas',
  'Run the System until Pause': 'Correr o Sistema até Pausa', 'Run the System for 100 ms': 'Correr o Sistema durante 100 ms',
  'Restart the System from time 0 (its modules compiled again)': 'Reiniciar o Sistema no tempo 0 (os módulos compilados de novo)',
  "Show the System's waves in the waveform viewer": 'Mostrar as ondas do Sistema no visualizador de formas de onda',
  'Compiling…': 'A compilar…', 'Type a line, Enter sends it': 'Escreva uma linha, Enter envia-a',
  'change(s)': 'alteração(ões)',
  // the System Emulator (#5212)
  'Emulate': 'Emular', 'Emulate the System: its boards side by side, interactive, in real time': 'Emular o Sistema: as suas placas lado a lado, interativas, em tempo real',
  'Emulate System': 'Emular o Sistema', 'Run the System in real time until Pause': 'Correr o Sistema em tempo real até Pausa',
  'Terminals': 'Terminais', '☰ Terminals': '☰ Terminais', 'Show / hide the terminals panel': 'Mostrar / ocultar o painel dos terminais',
  'Collapse the terminals panel': 'Recolher o painel dos terminais', 'Expand the terminals panel': 'Expandir o painel dos terminais',
  'LED L (D13)': 'LED L (pino D13)', 'Power': 'Alimentação',
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
  'no interface': 'sem interface', 'Serial terminal': 'Terminal série', 'no module': 'sem módulo', 'no firmware': 'sem firmware', 'no board': 'sem placa',
};
export const SYSTEM_PT_PATTERNS = [
  [/^(FPGA|Microcontroller|Serial terminal) ([A-Za-z]\w*)$/, (m, k, id) => `${{ FPGA: 'FPGA', Microcontroller: 'Microcontrolador', 'Serial terminal': 'Terminal série' }[k]} ${id}`],
  [/^Link ([A-Za-z]\w*)$/, 'Ligação $1'], [/^Waves \((.+)\)$/, 'Ondas ($1)'],
  [/^Emulate \((.+)\)$/, 'Emular ($1)'], [/^(\d+)% of real time$/, '$1% do tempo real'],
  [/^(\d+) registers? · (\d+) bytes?$/, (m, n, b) => `${n} ${n === '1' ? 'registo' : 'registos'} · ${b} byte${b === '1' ? '' : 's'}`],
  [/^(\d+) nodes? · (\d+) links?$/, (m, n, l) => `${n} ${n === '1' ? 'nó' : 'nós'} · ${l} ${l === '1' ? 'ligação' : 'ligações'}`],
];
