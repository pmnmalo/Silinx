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
  'Baud': 'Débito (baud)', 'Frame': 'Trama', 'data bits, parity, stop bits: 8N1, 7E1…': 'bits de dados, paridade, bits de paragem: 8N1, 7E1…',
  'Pins': 'Pinos', "the module's ports, a bus's bit as led<0>": 'os portos do módulo, um bit de um barramento como led<0>', "the board's pins: D2, A0…": 'os pinos da placa: D2, A0…',
  'Direction': 'Direção', 'in': 'in', 'out': 'out', 'Remove Interface': 'Remover Interface', 'Remove the interface and its link': 'Remover a interface e a sua ligação',
  // the simulation view (#4701)
  'Simulate': 'Simular', 'Simulate System': 'Simular Sistema', 'Simulate the System: its nodes run together, its links decoded, its waves': 'Simular o Sistema: os nós a correr juntos, as ligações descodificadas, as ondas',
  '▶ Run': '▶ Correr', '⏸ Pause': '⏸ Pausa', 'Run 100 ms': 'Correr 100 ms', 'Restart': 'Reiniciar', 'Waves': 'Ondas',
  'Run the System until Pause': 'Correr o Sistema até Pausa', 'Run the System for 100 ms': 'Correr o Sistema durante 100 ms',
  'Restart the System from time 0 (its modules compiled again)': 'Reiniciar o Sistema no tempo 0 (os módulos compilados de novo)',
  "Show the System's waves in the waveform viewer": 'Mostrar as ondas do Sistema no visualizador de formas de onda',
  'Compiling…': 'A compilar…', 'Type a line, Enter sends it': 'Escreva uma linha, Enter envia-a',
  'change(s)': 'alteração(ões)',
  // the drawing
  'no interface': 'sem interface', 'Serial terminal': 'Terminal série', 'no module': 'sem módulo', 'no firmware': 'sem firmware', 'no board': 'sem placa',
};
export const SYSTEM_PT_PATTERNS = [
  [/^(FPGA|Microcontroller|Serial terminal) ([A-Za-z]\w*)$/, (m, k, id) => `${{ FPGA: 'FPGA', Microcontroller: 'Microcontrolador', 'Serial terminal': 'Terminal série' }[k]} ${id}`],
  [/^Link ([A-Za-z]\w*)$/, 'Ligação $1'], [/^Waves \((.+)\)$/, 'Ondas ($1)'],
  [/^(\d+) nodes? · (\d+) links?$/, (m, n, l) => `${n} ${n === '1' ? 'nó' : 'nós'} · ${l} ${l === '1' ? 'ligação' : 'ligações'}`],
];
