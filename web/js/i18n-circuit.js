// Portuguese strings of the digital circuit editor (web/js/circuit-editor.js, #3897; merged into the dictionary of i18n.js).
export const CIRCUIT_PT = {
  // New Source, the Design pane
  'Circuit': 'Circuito',
  // toolbar
  'Wire': 'Fio', '↺ Reset': '↺ Recomeçar',
  'Draw a wire: click its start, its bends, then its end on a pin or a hole (double click or Esc: end it there)': 'Desenhar um fio: clique no início, nas dobras e no fim, num pino ou num furo (duplo clique ou Esc: acaba aí)',
  'Turn the selected part a quarter clockwise (R)': 'Rodar a peça selecionada um quarto de volta no sentido dos ponteiros do relógio (R)',
  'Check the circuit: short circuits, unpowered ICs, floating inputs, parts and wires that join nothing': 'Verificar o circuito: curto-circuitos, CIs sem alimentação, entradas no ar, peças e fios que não ligam nada',
  'Simulate the circuit live: click a switch to flip it, press a button to hold it': 'Simular o circuito ao vivo: clique num interruptor para o mudar, carregue num botão para o manter premido',
  'Start the simulation again from time 0': 'Recomeçar a simulação no instante 0',
  // side panel
  'Parts': 'Peças', 'Breadboards': 'Placas de ensaio', 'Power': 'Alimentação', 'Inputs': 'Entradas', 'Outputs': 'Saídas', 'Gates (74LS)': 'Portas (74LS)',
  'Half breadboard': 'Meia placa de ensaio', 'Power supply (+5 V, GND)': 'Fonte de alimentação (+5 V, GND)', 'Logic switch': 'Interruptor lógico',
  'Push button (momentary, normally open)': 'Botão de pressão (momentâneo, normalmente aberto)', 'LED': 'LED',
  'Label': 'Etiqueta', 'Colour': 'Cor', 'HDL language': 'Linguagem HDL',
  'red': 'vermelho', 'green': 'verde', 'yellow': 'amarelo', 'blue': 'azul', 'white': 'branco', 'black': 'preto', 'orange': 'laranja', 'purple': 'roxo',
};
const GATE = { NAND: 'NAND', AND: 'AND', OR: 'OR', XOR: 'XOR' };
const TITLE = { 'Half breadboard': 'Meia placa de ensaio', 'Power supply (+5 V, GND)': 'Fonte de alimentação (+5 V, GND)', 'Logic switch': 'Interruptor lógico',
  'Push button (momentary, normally open)': 'Botão de pressão (momentâneo, normalmente aberto)', LED: 'LED', 'Hex inverter': 'Seis inversores' };
const title = (t) => TITLE[t] ?? t.replace(/^Quad 2-input (NAND|AND|OR|XOR)$/, (m, g) => `Quatro portas ${GATE[g]} de 2 entradas`);
export const CIRCUIT_PT_PATTERNS = [
  // the status line's counts (#2763)
  [/^(\d+) IC\(s\) · (\d+) switch\(es\) · (\d+) LED\(s\) · (\d+) wire\(s\)$/, '$1 CI(s) · $2 interruptor(es) · $3 LED(s) · $4 fio(s)'],
  // the library's ICs and their tips
  [/^(74\d\d) (Quad 2-input (?:NAND|AND|OR|XOR)|Hex inverter)$/, (m, n, t) => `${n} ${title(t)}`],
  [/^(.+): click it, then the drawing \(Esc: done\)$/, (m, t) => `${title(t)}: clique nela e depois no desenho (Esc: terminar)`],
  // the selection
  [/^([A-Za-z]\w*): (Half breadboard|Power supply \(\+5 V, GND\)|Logic switch|Push button \(momentary, normally open\)|LED|Hex inverter|Quad 2-input (?:NAND|AND|OR|XOR))$/, (m, id, t) => `${id}: ${title(t)}`],
  [/^(SN74LS\d\d): pinout$/, '$1: pinos'], [/^Typical delay (\d+) ns$/, 'Atraso típico de $1 ns'],
  [/^Input ([A-Za-z]\w*) of the HDL$/, 'Entrada $1 do HDL'], [/^Output ([A-Za-z]\w*) of the HDL$/, 'Saída $1 do HDL'],
  [/^Wire ([A-Za-z]\w*)$/, 'Fio $1'],
];
