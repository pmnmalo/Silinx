// Interface internationalisation.
//
// The UI is written in English; this module translates the visible text of the page (text nodes,
// title/placeholder/aria-label attributes, option labels) from per-language dictionaries, and keeps
// translating whatever the app adds later (dialogs, menus, SSim, editors) through a MutationObserver.
// User content is never translated: code editors, the console (tool output), the design hierarchy,
// schematic/waveform drawings and anything inside [data-no-i18n].
//
// Add a language: add an entry to LOCALES ({ name, strings: { "English text": "translation" },
// patterns: [[/regex/, "replacement with $1"]] }). Strings missing from a dictionary stay in English.
// Code can also call t('English text') directly.

import { TT_PT, TT_PT_PATTERNS } from './i18n-truthtable.js';
import { INK_PT, INK_PT_PATTERNS } from './i18n-ink.js';
import { IO_PT, IO_PT_PATTERNS } from './i18n-inout.js';
import { LINT_PT } from './i18n-lint.js';
import { EDITOR_PT, EDITOR_PT_PATTERNS } from './i18n-editor.js';
import { FSM_PT, FSM_PT_PATTERNS } from './i18n-fsm.js';
import { PETRI_PT, PETRI_PT_PATTERNS } from './i18n-petri.js';
import { CIRCUIT_PT, CIRCUIT_PT_PATTERNS } from './i18n-circuit.js';
import { SYMBOL_PT, SYMBOL_PT_PATTERNS } from './i18n-symbol.js';
import { FPGA_PT, FPGA_PT_PATTERNS } from './i18n-fpga.js';
import { SCH_PT, SCH_PT_PATTERNS } from './i18n-schematic.js';
import { CLOCKING_PT, CLOCKING_PT_PATTERNS } from './i18n-clocking.js';
import { WIZARDS_PT, WIZARDS_PT_PATTERNS } from './i18n-wizards.js';
import { LINK_PT, LINK_PT_PATTERNS } from './i18n-link.js';
import { VERIFY_PT, VERIFY_PT_PATTERNS } from './i18n-verify.js';
import { GIT_PT, GIT_PT_PATTERNS } from './i18n-git.js';
import { MERGE_PT, MERGE_PT_PATTERNS } from './i18n-merge.js';
import { COLLAB_PT, COLLAB_PT_PATTERNS } from './i18n-collab.js';
import { MEMORY_PT, MEMORY_PT_PATTERNS } from './i18n-memory.js';
import { RESOURCES_PT, RESOURCES_PT_PATTERNS } from './i18n-resources.js';
import { PINS_PT, PINS_PT_PATTERNS } from './i18n-pins.js';
import { LABS_PT, LABS_PT_PATTERNS } from './i18n-labs.js';
import { GRADE_PT, GRADE_PT_PATTERNS } from './i18n-grade.js';
import { CAPTURE_PT, CAPTURE_PT_PATTERNS } from './i18n-capture.js';
import { PROGRAM_PT, PROGRAM_PT_PATTERNS } from './i18n-program.js';
import { SUMMARY_PT, SUMMARY_PT_PATTERNS } from './i18n-summary.js';
import { MESSAGES_PT, MESSAGES_PT_PATTERNS } from './i18n-messages.js';
import { PT } from './i18n-general.js';   // (moved, #4765)
import { prefKey } from './prefs.js';

const PT_GATE_INV = { 'input I0': 'a entrada I0', 'inputs I0 and I1': 'as entradas I0 e I1' };
const PT_FF = [['synchronous set and reset (S over R)', 'set e reset síncronos (S antes de R)'], ['synchronous reset and set (R over S)', 'reset e set síncronos (R antes de S)'],
  ['clock enable', 'habilitação do relógio'], ['asynchronous clear', 'clear assíncrono'], ['asynchronous preset', 'preset assíncrono'],
  ['synchronous reset', 'reset síncrono'], ['synchronous set', 'set síncrono']];
const PT_PATTERNS = [
  [/^(\d+) states?(?: · (\d+) every-cycle blocks?)?$/, (m, n, b) => `${n} estado${n === '1' ? '' : 's'}${b ? ` · ${b} bloco${b === '1' ? '' : 's'} de cada ciclo` : ''}`],   // (the ASM editor's toolbar, #2730)
  // the serial terminal's rates (#2536)
  [/^(\d+) baud$/, '$1 baud'],
  // (Open Project's Stored In tip, #4314)
  [/^Kept in the workspace folder(?:, in the GitHub repository (\S+))?\.$/, (m, r) => `Guardado na pasta de trabalho${r ? `, no repositório GitHub ${r}` : ''}.`],
  [/^Kept in this browser's storage(?:, in the GitHub repository (\S+))?\.$/, (m, r) => `Guardado no armazenamento deste navegador${r ? `, no repositório GitHub ${r}` : ''}.`],
  // Find in Project (#1430)
  [/^(\d+) result\(s\) in (\d+) file\(s\)$/, '$1 resultado(s) em $2 ficheiro(s)'], [/^(\d+) replacement\(s\) in (\d+) file\(s\)$/, '$1 substituição(ões) em $2 ficheiro(s)'],
  [/^Invalid regular expression: (.*)$/, 'Expressão regular inválida: $1'],
  // (the iCE40's Configure Target Device, #2298)
  [/^Configuration file: (\S+) \((\d+) bytes\)$/, 'Ficheiro de configuração: $1 ($2 bytes)'],
  [/^There is no (\S+) yet\. Implement the design and generate it now\?$/, 'Ainda não há $1. Implementar o projeto e gerá-lo agora?'],
  [/^Trust the project "(.+)"\? Xilinx ISE and programming a board or a PROM will run for it: trust only a project whose files you know\.$/, 'Confiar no projeto "$1"? O Xilinx ISE e a programação de uma placa ou de uma PROM passam a correr para ele: confie apenas num projeto cujos ficheiros conhece.'],   // (#4583)
  [/^Write (\S+) into the board's SPI flash\? The FPGA then loads it, and again at every power-up\.$/, 'Escrever $1 na flash SPI da placa? A FPGA depois carrega-o, e de novo sempre que é ligada.'],
  // Simulate's side panel: a test bench's row (#1378)
  [/^Simulate ([A-Za-z][A-Za-z0-9_]*)$/, 'Simular $1'],
  [/^([^\n]*)\nDrag to move it, or Alt\+Shift\+← \/ →$/, (m, tip) => `${t(tip)}\nArraste para o mover, ou Alt+Shift+← / →`],   // (a document's tab's tooltip, its own translated, #2887)
  [/^Read-only, the C model of (.+)$/, 'Só de leitura, o modelo C de $1'],
  [/^Translated to (VHDL|Verilog) \(read-only\)$/, 'Traduzido para $1 (só de leitura)'],
  // the Development menu (#707)
  [/^All Changes since (\d+\.\d+\.\d+)…$/, 'Todas as Alterações desde a $1…'], [/^Changes since (\d+\.\d+\.\d+)$/, 'Alterações desde a $1'],
  [/^Pointers down at once: (\d+) \(most: (\d+)\)$/, 'Ponteiros premidos ao mesmo tempo: $1 (máximo: $2)'],
  [/^This Build on GitHub \(commit (\w+)\)$/, 'Esta Versão no GitHub (commit $1)'],
  // the tip of a drawing's link banner, shortened on a narrow screen (#266)
  // the HDL editor's banner of a file generated from a drawing, out of sync (#1176)
  [/^— the (schematic|state machine|Petri net) has errors: ([\s\S]*)$/, (m, w, why) => `— ${{ schematic: 'o esquemático tem', 'state machine': 'a máquina de estados tem', 'Petri net': 'a rede de Petri tem' }[w]} erros: ${why}`],
  // a process run on the top module while another module is selected (#223)
  [/^(.+) (implements|synthesizes|emulates) the top module '(.+)', not the selected module '(.+)'\.$/,
    (m, p, v, top, sel) => `${t(p)} ${{ implements: 'implementa', synthesizes: 'sintetiza', emulates: 'emula' }[v]} o módulo de topo '${top}', não o módulo selecionado '${sel}'.`],
  // the browser edition's workspace folder (its name)
  [/^Reopen (.+)$/, 'Reabrir $1'], [/^In the folder (.+) on the disk\.$/, 'Na pasta $1 no disco.'], [/^Storage: folder (.+)$/, 'Armazenamento: pasta $1'], [/^Projects are kept in the folder (.+) on the disk \(File ▸ Open Workspace Folder… to change it\)\.$/, 'Os projetos ficam guardados na pasta $1 do disco (File ▸ Open Workspace Folder… para a mudar).'], [/^The browser has not answered about the workspace folder '(.+)' for (\d+) s: quit it completely \(Cmd\+Q on a Mac, ⋮ ▸ Exit on Windows and Linux; closing its window is not enough\) and open it again\.$/, "O navegador não respondeu sobre a pasta de trabalho '$1' durante $2 s: fecha-o por completo (Cmd+Q no Mac, ⋮ ▸ Sair no Windows e no Linux; fechar a janela não chega) e volta a abri-lo."],
  // schematic symbols: flip-flops (FD*, FT*, FJK*)
  [/^(D|Toggle \(T\)|J-K) flip-flop(?: with (.*?))?( \(bitwise when Width > 1\))?$/, (m, k, w, bw) => {
    let r = w || '';
    for (const [a, b] of PT_FF) r = r.split(a).join(b);
    return `Flip-flop ${k === 'Toggle (T)' ? 'T (toggle)' : k}${w ? ` com ${r.replace(/ and /g, ' e ')}` : ''}${bw ? ' (bit a bit quando Largura > 1)' : ''}`;
  }],
  // schematic symbols: inverted-input gates (AND2B1...), decoders, encoders, demultiplexers
  [/^Multiplexer of 2, 4, 8 or 16 data inputs, its select bits \(1 to 4\), select bus and enable in its properties \(bitwise when Width > 1\)$/,
    'Multiplexador de 2, 4, 8 ou 16 entradas de dados, os bits de seleção (1 a 4), o barramento de seleção e a habilitação nas suas propriedades (bit a bit quando Largura > 1)'],
  // the stimuli drawn on the waveforms (#336): the timing dialog's hint, the bar's status, the errors
  [/^The inputs of (\S+) as a grid of cycles: with a clock, the inputs change at its falling edge and the outputs are checked before the next one; without one, they change at every cycle, one for each combination of the inputs\.$/,
    'As entradas de $1 como uma grelha de ciclos: com relógio, as entradas mudam no seu flanco descendente e as saídas são verificadas antes do seguinte; sem relógio, mudam a cada ciclo, um por cada combinação das entradas.'],
  [/^(\d+) cycles \((?:clock (\S+), period (\d+) ns|combinational, step (\d+) ns)\): (no expected outputs|expected outputs OK|(\d+) mismatch\(es\))$/,
    (m, n, clk, per, step, res, bad) => `${n} ciclos (${clk ? `relógio ${clk}, período ${per} ns` : `combinatório, passo ${step} ns`}): ${bad ? `${bad} diferença(s)` : res === 'expected outputs OK' ? 'saídas esperadas certas' : 'sem saídas esperadas'}`],
  [/^(Cycles|Clock Period|Time Step): a whole number of at least (\d+)$/, (m, f, n) => `${{ Cycles: 'Ciclos', 'Clock Period': 'Período do Relógio', 'Time Step': 'Passo de Tempo' }[f]}: um número inteiro de pelo menos ${n}`],
  [/^'(.*)' is not a value \(bits(, -| 0 1 Z X), h… hexadecimal or d… decimal\)$/, (m, v, b) => `'${v}' não é um valor (bits${b === ', -' ? ', -' : ' 0 1 Z X'}, h… hexadecimal ou d… decimal)`],
  [/^'(.*)' does not fit in (\d+) bit\(s\)$/, "'$1' não cabe em $2 bit(s)"],
  [/^'(.*)' is not a valid name \(a letter, then letters, digits or _\)\.$/, "'$1' não é um nome válido (uma letra, depois letras, algarismos ou _)."],
  [/^'(.*)' is not a valid file name \(letters, digits, _ \. - and folders; \.wcfg\)\.$/, "'$1' não é um nome de ficheiro válido (letras, algarismos, _ . - e pastas; .wcfg)."],
  [/^(AND|OR|NAND|NOR|XOR|XNOR) gate of 2, 3 or 4 inputs, its inputs and inverted inputs in its properties \(bitwise when Width > 1\)$/,
    'Porta $1 de 2, 3 ou 4 entradas, as entradas e as entradas invertidas nas suas propriedades (bit a bit quando Largura > 1)'],
  [/^(\d)-input (AND|OR|NAND|NOR|XOR|XNOR) gate with (input I0|inputs I0 and I1|inputs I0\.\.I\d) inverted \(bitwise when Width > 1\)$/,
    (m, n, g, which) => `Porta ${g} de ${n} entradas com ${PT_GATE_INV[which] || `as entradas ${which.slice(7)}`} invertida${which === 'input I0' ? '' : 's'} (bit a bit quando Largura > 1)`],
  [/^(\d+):(\d+) decoder with enable \(Xilinx (\w+)\): D<A> = E, the other outputs 0$/, 'Descodificador $1:$2 com habilitação (Xilinx $3): D<A> = E, as outras saídas a 0'],
  [/^(\d+):(\d+) priority encoder: A = index of the highest input at 1 \(0 when none\), V = some input is 1$/, 'Codificador com prioridade $1:$2: A = índice da entrada a 1 de maior índice (0 se nenhuma), V = alguma entrada a 1'],
  [/^(\d+):(\d+) one-hot encoder: A = OR of the indices of the inputs at 1, V = some input is 1$/, 'Codificador one-hot $1:$2: A = OU dos índices das entradas a 1, V = alguma entrada a 1'],
  [/^1:(\d+) demultiplexer \((select S0|(\d)-bit select S)\): O<S> = D, the other outputs 0 \(bitwise when Width > 1\)$/,
    (m, n, sel, k) => `Desmultiplexador 1:${n} (${k ? `seleção S de ${k} bits` : 'seleção S0'}): O<S> = D, as outras saídas a 0 (bit a bit quando Largura > 1)`],
  [/^(Logic|Buffers|Arithmetic|Flip-Flops|Mux|Decoders\/Encoders|Bus|General|Device Primitives|Project modules) \((\d+)\)$/, (m, c, n) => `${t(c)} (${n})`],
  [/^Silinx - (.*) - \[(.*)\]$/, (m, a, b) => `Silinx - ${a} - [${t(b)}]`],
  [/^(.*) \(RTL\)$/, '$1 (RTL)'],
  [/^(.*) \(Technology\)$/, '$1 (Tecnológico)'], [/^(.*) \(composition\)$/, '$1 (composição)'], [/^Read-only, how (.+) is built$/, 'Só de leitura, como $1 é construído'], [/^, its values (.+)'s in the Try it of (.+)$/, ', com os valores de $1 no Experimentar de $2'],   // (a palette symbol's composition, #4808)
  [/^Processes: (.*)$/, 'Processos: $1'],
  [/^HDL kept with the schematic \((VHDL|VERILOG)\)$/, 'HDL guardado com o esquemático ($1)'],
  [/^Language: (.*)$/, 'Idioma: $1'],
  [/^(\d+)\/(\d+) I\/Os assigned$/, '$1/$2 E/S atribuídas'],
  // I/O Pin Planning's status line (#2763)
  [/^Top: (.*)$/, 'Topo: $1'], [/^Device (\S+)$/, 'Dispositivo $1'], [/^Board: (.*)$/, 'Placa: $1'], [/^no board selected$/, 'sem placa selecionada'],
  [/^(.*) Project Status$/, 'Estado do Projeto $1'],
  [/^Configuration file: (.*)$/, 'Ficheiro de configuração: $1'],
  [/^Bitstream: design (.*)$/, 'Bitstream: projeto $1'],
  [/^(\d+) Errors$/, '$1 Erros'], [/^(\d+) Warnings$/, '$1 Avisos'], [/^(\d+) HDL files$/, '$1 ficheiros HDL'],
  [/^position (\d+)$/, 'posição $1'],
  [/^(\d+) file\(s\) selected$/, '$1 ficheiro(s) selecionado(s)'],
  [/^Folder '(.*)': (\d+) file\(s\), project (.*)$/, "Pasta '$1': $2 ficheiro(s), projeto $3"],
  [/^Folder '(.*)': (\d+) file\(s\) — no (silinx\.json|\.xise) found!$/, "Pasta '$1': $2 ficheiro(s) — sem $3!"],
  [/^Balanced \((Speed|Area)\)$/, (m, g) => `Equilibrado (${g === 'Speed' ? 'Velocidade' : 'Área'})`],
  [/^Example: (.*)$/, 'Exemplo: $1'],
  [/^Test design: (.*)$/, 'Projeto de teste: $1'],
  [/^Settings file: (.*)$/, 'Ficheiro de definições: $1'],
  // the Silinx toolchain: the status of the project's device
  // I/O Pin Planning without its top (#253)
  [/^The top-level module '(.+)' is not in the project\.$/, "O módulo de topo '$1' não está no projeto."],
  [/^The ports of the top-level module '(.+)' cannot be read: (.+)\.$/, "As portas do módulo de topo '$1' não podem ser lidas: $2."],
  [/^Silinx toolchain for (\S+): (available|not available)$/, (m, p, a) => `Toolchain Silinx para ${p}: ${a === 'available' ? 'disponível' : 'não disponível'}`],
  [/^(\S+): device description \((shipped with Silinx|built from your ISE)\) and bit database$/, (m, p, w) => `${p}: descrição do dispositivo (${w === 'built from your ISE' ? 'construída a partir do seu ISE' : 'fornecida com o Silinx'}) e base de dados de bits`],
  [/^no bit database for (\S+) yet \(only the (.+)\): use an ISE mode for this device$/, 'ainda não há base de dados de bits para o $1 (só para o $2): use um modo ISE para este dispositivo'],
  [/^no bit database for the pads of the (\S+) in the (\S+) package yet \((?:only (.+)|no package yet)\): use an ISE mode for this device$/, (m, d, p, o) => `ainda não há base de dados de bits para os pinos do ${d} no encapsulamento ${p} (${o ? `só ${o}` : 'nenhum encapsulamento ainda'}): use um modo ISE para este dispositivo`],
  [/^no device description of (\S+) ships with Silinx \(the Silinx toolchain supports the (.+)\): use an ISE mode for this device$/, 'o Silinx não inclui a descrição do dispositivo $1 (a toolchain Silinx suporta o $2): use um modo ISE para este dispositivo'],
  [/^the Silinx toolchain does not support the (\S+) family yet \(only the Spartan-3E (.+)\): use an ISE mode$/, 'a toolchain Silinx ainda não suporta a família $1 (só o Spartan-3E $2): use um modo ISE'],
  [/^Not met \((\d+) constraints\)$/, 'Não cumpridas ($1 restrições)'],
  [/^Not met \((\d+) failing endpoints\)$/, 'Não cumpridas ($1 terminais em falha)'],
  // (a clock no constraint asks for, nextpnr's timing: #2300)
  [/^([\d.]+) MHz \(([\d.]+) ns\) — no constraint$/, '$1 MHz ($2 ns) — sem restrição'],
  [/^Version (\d[\w.-]*)$/, 'Versão $1'],
  // schematic palette: "<SYMBOL>: <description>"
  [/^([A-Z][A-Z0-9_]*(?: [A-Z]+)?): (.+)$/, (m, a, b) => `${a}: ${t(b)}`],
];

// t() looks strings up trimmed: the keys are trimmed the same way
for (const k of Object.keys(PT)) { const tk = k.trim(); if (tk !== k) { if (!(tk in PT)) PT[tk] = PT[k].trim(); delete PT[k]; } }
Object.assign(PT, {
  'Not in sync with': 'Não sincronizado com', 'Generated from': 'Gerado a partir de', 
  // the HDL editor's banner of a file generated from a drawing (#1176)
  'Push into': 'Entrar', 'Composition': 'Composição', '(composition)': '(composição)', 'How it is built, down to the gates (read-only)': 'Como é construído, até às portas lógicas (só de leitura)', 'Generated from its schematic (read-only)': 'Gerado a partir do seu esquemático (só de leitura)', 'How it is built: its composition, down to the gates': 'Como é construído: a sua composição, até às portas lógicas', 'How it is built, with these values (or double-click it)': 'Como é construído, com estes valores (ou duplo clique)', 'Up to the level above (Backspace)': 'Subir para o nível acima (Backspace)', 'Read-only, generated from': 'Só de leitura, gerado a partir de', 'Read-only, translated from': 'Só de leitura, traduzido de', 'Cannot be translated from': 'Não pode ser traduzido de', 'Read-only, not in sync with': 'Só de leitura, não sincronizado com',
  
  
  
  // Design Summary, File menu, project / import dialogs, toolchain, About, shortcuts
  'Device Utilization Summary (not yet implemented)': 'Resumo da Utilização do Dispositivo (ainda não implementado)',
  'Tip: double-click a process in the Processes panel to run it. Simulation runs entirely inside Silinx; synthesis/implementation require Xilinx ISE 14.7 (Toolchain Settings (the gear in the toolbar)).':
    'Dica: faça duplo clique num processo no painel Processos para o executar. A simulação corre inteiramente no Silinx; a síntese/implementação requer o Xilinx ISE 14.7 (Definições da Toolchain (a roda dentada da barra de ferramentas)).',
  'Print…': 'Imprimir…', 'Print': 'Imprimir', 'Source': 'Fonte', 'Source (read-only)': 'Fonte (só de leitura)', 'Marker': 'Marcador', 'Time shown': 'Tempo mostrado', 'Simulation time': 'Tempo de simulação', 'project name': 'nome do projeto', 'new project name': 'nome do novo projeto', 'file name': 'nome do ficheiro',
  'Device': 'Dispositivo', 'Top': 'Topo', 'Board': 'Placa', 'Last Used': 'Último uso', 'Stored In': 'Guardado em', 'Workspace Folder': 'Pasta de Trabalho', 'Browser Storage': 'Armazenamento do Navegador',   // (Open Project's Stored In, #4314)
  '.zip file:': 'Ficheiro .zip:',
  'Import a whole Silinx project from its folder (the folder with the silinx.json file), or from a .zip of that folder (e.g. one exported with File ▸ Export Project (.zip)…).':
    'Importe um projeto Silinx completo a partir da sua pasta (a pasta com o ficheiro silinx.json), ou de um .zip dessa pasta (p. ex. um exportado com Ficheiro ▸ Exportar Projeto (.zip)…).',
  'Its build folder (build) and hidden files are not imported.': 'A sua pasta de compilação (build) e os ficheiros ocultos não são importados.',
  'or .zip file:': 'ou ficheiro .zip:',
  'The folder holds no silinx.json nor .xise: it is not a project Silinx reads.': 'A pasta não tem silinx.json nem .xise: não é um projeto que o Silinx leia.',
  'Easiest setup on any OS:': 'Configuração mais simples em qualquer sistema operativo:',
  'build the private Docker image with the Silinx kit (docker/ise/README.md):': 'construa a imagem Docker privada com o kit do Silinx (docker/ise/README.md):',
  '(Windows: build-ise-image.ps1). It configures Silinx automatically.': '(Windows: build-ise-image.ps1). Configura o Silinx automaticamente.',
  'auto-detect (…/14.7/ISE_DS/settings64.sh)': 'deteção automática (…/14.7/ISE_DS/settings64.sh)',
  'Synthesis, place & route and bitstream generation use the Silinx toolchain (Yosys, nextpnr, and the bitstream writer of Silinx, icepack for the iCE40 or ecppack for the ECP5) for the Basys2, Nexys2, Nexys3, Atlys, iCEBreaker and ULX3S boards, or the Xilinx ISE 14.7 command-line tools. Xilinx, ISE, ISim, iMPACT and Spartan are trademarks of AMD/Xilinx; Silinx is an independent project, not affiliated with or endorsed by AMD/Xilinx.':
    'A síntese, o place & route e a geração do bitstream usam a toolchain Silinx (o Yosys, o nextpnr, e o gerador de bitstreams do próprio Silinx, o icepack para a iCE40 ou o ecppack para a ECP5) para as placas Basys2, Nexys2, Nexys3, Atlys, iCEBreaker e ULX3S, ou as ferramentas de linha de comandos do Xilinx ISE 14.7. Xilinx, ISE, ISim, iMPACT e Spartan são marcas registadas da AMD/Xilinx; o Silinx é um projeto independente, sem afiliação nem aprovação da AMD/Xilinx.',
  'F12 or Ctrl/Cmd+Click': 'F12 ou Ctrl/Cmd+Clique',
  // the Silinx toolchain (Toolchain Settings, Processes, Design Summary)
  'Silinx toolchain (no ISE)': 'Toolchain Silinx (sem ISE)', 'Synthesize - Yosys': 'Sintetizar - Yosys',
  'Silinx toolchain (no ISE): selected': 'Toolchain Silinx (sem ISE): selecionada',
  'Needs Xilinx ISE: not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings)': 'Requer o Xilinx ISE: não disponível com a toolchain Silinx (escolha um modo ISE nas Definições da Toolchain)',
  'Silinx toolchain: open a project to see whether its device is supported': 'Toolchain Silinx: abra um projeto para ver se o seu dispositivo é suportado',
  'Supported now: the Spartan-3E XC3S100E, XC3S250E (Basys2), XC3S500E and XC3S1200E (Nexys2).': 'Suportado agora: o Spartan-3E XC3S100E, XC3S250E (Basys2), XC3S500E e XC3S1200E (Nexys2).',
  'Device Utilization Summary (Silinx toolchain)': 'Resumo da Utilização do Dispositivo (toolchain Silinx)',
  'Device Utilization Summary (after synthesis)': 'Resumo da Utilização do Dispositivo (após a síntese)',
  'Timing (post Place & Route, Silinx toolchain estimate)': 'Temporização (após Posicionar e Encaminhar, estimativa da toolchain Silinx)',
  'Timing (post Place & Route, nextpnr\'s estimate: conservative against Vivado)': 'Temporização (após Posicionar e Encaminhar, estimativa do nextpnr: conservadora face ao Vivado)',
  'Timing (post Place & Route, nextpnr\'s analysis)': 'Temporização (após Posicionar e Encaminhar, análise do nextpnr)',
  'Synthesis Report (Yosys)': 'Relatório de Síntese (Yosys)', 'Placed Design (XDL)': 'Projeto Posicionado (XDL)', 'Routed Design (XDL)': 'Projeto Encaminhado (XDL)', 'Routed Design (ASC)': 'Projeto Encaminhado (ASC)', 'Routed Design (Trellis configuration)': 'Projeto Encaminhado (configuração Trellis)', 'Routed Design (nextpnr JSON)': 'Projeto Encaminhado (JSON do nextpnr)', 'Routed Design (Peppercorn configuration)': 'Projeto Encaminhado (configuração Peppercorn)', 'Routed Design (FASM)': 'Projeto Encaminhado (FASM)',
  'Static Timing Report': 'Relatório de Temporização Estática',
  // AMD Vivado's reports (the 7-series, #1649)
  'Synthesize - Vivado': 'Sintetizar - Vivado',
  'Device Utilization Summary (AMD Vivado)': 'Resumo da Utilização do Dispositivo (AMD Vivado)', 'Design Rule Check': 'Verificação das Regras de Projeto',
  'No violations': 'Sem violações', 'Synthesis Utilization Report': 'Relatório de Utilização da Síntese', 'Utilization Report': 'Relatório de Utilização',
  'Route Status Report': 'Relatório do Estado do Encaminhamento', 'Timing Summary Report': 'Relatório Resumo da Temporização', 'DRC Report': 'Relatório de DRC', 'Vivado Log': 'Registo do Vivado',
  'Tip: double-click a process in the Processes panel to run it. Simulation runs entirely inside Silinx; synthesis and implementation of the 7-series use AMD Vivado 2025.2 (Toolchain Settings (the gear in the toolbar)).':
    'Dica: faça duplo clique num processo no painel Processos para o executar. A simulação corre inteiramente no Silinx; a síntese e a implementação da série 7 usam o AMD Vivado 2025.2 (Definições da Toolchain (a roda dentada da barra de ferramentas)).',
  'Tip: double-click a process in the Processes panel to run it. Simulation runs entirely inside Silinx; synthesis and implementation use the Silinx toolchain (no ISE): Toolchain Settings (the gear in the toolbar).':
    'Dica: faça duplo clique num processo no painel Processos para o executar. A simulação corre inteiramente no Silinx; a síntese e a implementação usam a toolchain Silinx (sem ISE): Definições da Toolchain (a roda dentada da barra de ferramentas).',
  // board emulator
  'Real time': 'Tempo real', 'Compiled (real speed)': 'Compilado (velocidade real)', 'Event-driven (debugging)': 'Por eventos (depuração)',
  'The simulator that runs the design: compiled (its netlist, at the board\'s real speed) or event-driven (the behavioural RTL, with X values and the design\'s messages: for debugging)':
    'O simulador que corre o projeto: compilado (a sua netlist, à velocidade real da placa) ou por eventos (o RTL comportamental, com valores X e as mensagens do projeto: para depuração)',
  'Compiling the design for the Board Emulator (Yosys)…': 'A compilar o projeto para o Emulador de Placa (Yosys)…',
  'Starting the Board Emulator…': 'A iniciar o Emulador de Placa…',
  'VGA monitor (640×480)': 'Monitor VGA (640×480)', 'VGA monitor': 'Monitor VGA', 'Serial terminal': 'Terminal série', 'Send': 'Enviar',
  'Type a line, Enter sends it with CR': 'Escreva uma linha; Enter envia-a com CR', 'The baud rate (8 data bits, no parity, 1 stop bit)': 'A taxa de transmissão (8 bits de dados, sem paridade, 1 bit de paragem)',
  'Display': 'Mostrador', 'Switches': 'Interruptores',
  'Show or hide this module: the design goes on running': 'Mostrar ou esconder este módulo: o projeto continua a executar', 'No signal': 'Sem sinal',
  'The VGA monitor needs the compiled engine (the event-driven one is too slow for a frame)': 'O monitor VGA precisa do motor compilado (o motor por eventos é demasiado lento para uma imagem)',
  'HSYNC active high: 640×480 at 60 Hz has it active low': 'HSYNC ativo a 1: em 640×480 a 60 Hz é ativo a 0',
  'VSYNC active high: 640×480 at 60 Hz has it active low': 'VSYNC ativo a 1: em 640×480 a 60 Hz é ativo a 0',
  'No VSYNC: the monitor finds no frames': 'Sem VSYNC: o monitor não encontra imagens',
  'Max speed': 'Velocidade máxima', '▶ Run': '▶ Executar', '⏸ Pause': '⏸ Pausa', '⏭ Step': '⏭ Passo', '⟲ Power cycle': '⟲ Desligar/ligar',
  'Advance one clock cycle': 'Avançar um ciclo de relógio', 'Power-cycle the board: restart the design from time 0': 'Desligar e ligar a placa: reiniciar o projeto a partir do instante 0',
  'Emulated clock rate': 'Frequência do relógio emulado', 'Model:': 'Modelo:', 'Clock:': 'Relógio:', 'Timing:': 'Temporização:',
  'When hidden': 'Quando oculto', 'Engine': 'Motor', 'Show': 'Mostrar',   // (the emulator's ⋮ menu's section titles, #2846)
  'Keep running': 'Continuar a executar', 'Engine, when hidden, modules shown': 'Motor, quando oculto, módulos mostrados',
  'What the emulator does while it is not seen (another browser tab, a minimised window, another document tab): pause, and go on where it was when shown again, or keep running':
    'O que o emulador faz enquanto não está à vista (outro separador do navegador, uma janela minimizada, outro separador de documento): pausa, e continua onde estava quando volta a ser mostrado, ou continua a executar',
  'What runs on the board: the HDL (RTL) or a netlist generated by ISE (netgen)': 'O que corre na placa: o HDL (RTL) ou uma netlist gerada pelo ISE (netgen)',
  'Behavioral (RTL)': 'Comportamental (RTL)',
  'Character LCD (HD44780): lcd_e, lcd_rs, lcd_rw, lcd_d': 'LCD de caracteres (HD44780): lcd_e, lcd_rs, lcd_rw, lcd_d', 'LCD: not connected in the UCF': 'LCD: não ligado no UCF',
  'Turn the knob: ⟲ / ⟳ or the mouse wheel (ROT_A / ROT_B)': 'Rode o botão: ⟲ / ⟳ ou a roda do rato (ROT_A / ROT_B)',
  'Rotary encoder: ROT_A / ROT_B not connected in the UCF': 'Codificador rotativo: ROT_A / ROT_B não ligados no UCF',
  'Turn left (counter-clockwise)': 'Rodar para a esquerda (sentido anti-horário)', 'Turn right (clockwise)': 'Rodar para a direita (sentido horário)',
  'Watch': 'Observar', 'Add a signal to watch…': 'Adicionar um sinal a observar…', 'Timing generics': 'Genéricos de temporização',
'Messages': 'Mensagens', 'No clock input found': 'Nenhuma entrada de relógio encontrada',
  // ASM chart editor
  'Value(s) of this exit: binary digits, a literal, a|b, or others': 'Valor(es) desta saída: dígitos binários, um literal, a|b, ou others',
  'Registered output (holds its value, readable in conditions)': 'Saída registada (mantém o valor, pode ser lida em condições)',
  'Value(s) of this exit': 'Valor(es) desta saída', 'Value tested': 'Valor testado', 'Exits (value → box)': 'Saídas (valor → caixa)', 'Connection': 'Ligação', 'Case': 'Case',
  // schematic editor
  'Moving components: keep the wires connected (re-routed around other parts) or detach them': 'Ao mover componentes: manter os fios ligados (reencaminhados à volta das outras peças) ou desligá-los',
  'Check Schematic': 'Verificar Esquemático',
  'Module name': 'Nome do módulo', 'Sheet size': 'Tamanho da folha', 'Declarations': 'Declarações', 'Architecture name': 'Nome da arquitetura',
  'Instance name': 'Nome da instância', 'Module': 'Módulo', 'Title': 'Título', 'Input pins': 'Pinos de entrada', 'Output pins': 'Pinos de saída',
  'HDL type': 'Tipo HDL', 'Rename net': 'Mudar o nome da rede',
  // print dialog
  'Paper': 'Papel', 'Orientation': 'Orientação', 'Pages across': 'Páginas na horizontal', 'PNG resolution': 'Resolução PNG', 'Automatic': 'Automática',
  'Landscape': 'Horizontal', 'Portrait': 'Vertical', 'Automatic: landscape when what is shown is wider than the page. For a PDF choose "Save as PDF" in the print dialog.': 'Automática: horizontal quando o que é mostrado é mais largo do que a página. Para um PDF escolha "Guardar como PDF" no diálogo de impressão.', '1× (screen size)': '1× (tamanho do ecrã)', 'Save PNG': 'Guardar PNG', 'Save SVG': 'Guardar SVG',
  // placeholders
  'name': 'nome', 'Search symbols…': 'Procurar símbolos…', 'net name': 'nome da rede', 'auto': 'automático', 'e.g. my-ise:14.7': 'p.ex. my-ise:14.7',
});
const PT_POST = { 'Post-Synthesis': 'Pós-Síntese', 'Post-Translate': 'Pós-Translate', 'Post-Map': 'Pós-Map', 'Post-Place & Route': 'Pós-Place & Route' };
const PT_PRESS = { ' — click to toggle': ' — clique para comutar', ' — press and hold (Shift+click keeps it pressed)': ' — carregue e mantenha (Shift+clique mantém-no carregado)' };
const PT_THEN = { 'the simulation starts': 'a simulação começa', 'the emulator opens': 'o emulador abre', 'the technology schematic opens': 'o esquemático tecnológico abre' };
Object.assign(PT, { 'Generate and Simulate': 'Gerar e Simular', 'Generate and Emulate': 'Gerar e Emular', 'Generate and Show': 'Gerar e Mostrar' });
PT_PATTERNS.unshift(
  // a simulation model not generated yet (#490): generate it and go on, or why it cannot be
  [/^There is no (post-synthesis|post-translate|post-map|post-place & route) simulation model of '(.+)' yet\.$/,
    (m, n, top) => `Ainda não há modelo de simulação ${PT_POST[Object.keys(PT_POST).find((k) => k.toLowerCase() === n)].toLowerCase()} de '${top}'.`],
  [/^Generate it now with "(.+)"\? When it ends without errors, (the simulation starts|the emulator opens|the technology schematic opens)\.$/,
    (m, p, w) => `Gerá-lo agora com "${t(p)}"? Quando terminar sem erros, ${PT_THEN[w]}.`],
  [/^"(.+)" needs the Xilinx ISE toolchain: it is not available with the Silinx toolchain \(choose an ISE mode in Toolchain Settings\)\.$/,
    (m, p) => `"${t(p)}" requer a toolchain Xilinx ISE: não está disponível com a toolchain Silinx (escolha um modo ISE nas Definições da Toolchain).`],
  [/^"(.+)" needs the Xilinx ISE toolchain, which is not available \(configure it in Toolchain Settings \(the gear in the toolbar\)\)\.$/,
    (m, p) => `"${t(p)}" requer a toolchain Xilinx ISE, que não está disponível (configure-a em Definições da Toolchain (a roda dentada da barra de ferramentas)).`],
  // Program FPGA with no programming file, or one older than the sources (#1024): implement the design first
  [/^There is no programming file of '(.+)' yet\.$/, "Ainda não há ficheiro de programação de '$1'."],
  [/^The programming file of '(.+)' is older than the sources\.$/, "O ficheiro de programação de '$1' é mais antigo do que as fontes."],
  [/^The programming file of '(.+)' is not in this browser any more \(a build is kept for the browser session only\)\.$/, "O ficheiro de programação de '$1' já não está neste browser (uma compilação só fica guardada durante a sessão do browser)."],
  [/^The programming file of '(.+)' is not in the project's build folder any more\.$/, "O ficheiro de programação de '$1' já não está na pasta build do projeto."],
  [/^The last implementation of '(.+)' failed\.$/, "A última implementação de '$1' falhou."],
  // board emulator
  [/^Divide the timing generics \((.*)\) so that the design runs visibly at the emulator's speed$/, 'Dividir os genéricos de temporização ($1) para que o projeto avance visivelmente à velocidade do emulador'],
  [/^(Post-Synthesis|Post-Translate|Post-Map|Post-Place & Route) netlist$/, (m, n) => `Netlist ${PT_POST[n]}`],
  [/^(.+) = (.+) \(pin (\w+)\)( — click to toggle| — press and hold \(Shift\+click keeps it pressed\))?$/, (m, r, b, p, s) => `${r} = ${b} (pino ${p})${s ? PT_PRESS[s] : ''}`],
  [/^(.+): not connected in the UCF( — click to toggle| — press and hold \(Shift\+click keeps it pressed\))?$/, (m, r, s) => `${r}: não ligado no UCF${s ? PT_PRESS[s] : ''}`],
  [/^Clock (.+): ([\d.]+) MHz on the board( \(not in the UCF: assumed\))?( · not emulated: (.*))?$/, (m, c, f, a, n, l) => `Relógio ${c}: ${f} MHz na placa${a ? ' (não está no UCF: assumido)' : ''}${n ? ` · não emulado: ${l}` : ''}`],
  [/^No clock input found · not emulated: (.*)$/, 'Nenhuma entrada de relógio encontrada · não emulado: $1'],
  // a manual clock on a button or a switch (#347)
  [/^Manual clock (.+): one edge per press( · not emulated: (.*))?$/, (m, c, n, l) => `Relógio manual ${c}: um flanco em cada pressão${n ? ` · não emulado: ${l}` : ''}`],
  [/^Timing ÷(.+) \(emulation only\)$/, 'Temporização ÷$1 (só na emulação)'],
  // the engines (#418): why the design is not compiled, what the compiled engine warns of
  [/^Not compiled: (.+)$/, 'Não compilado: $1'],
  // the VGA monitor (#420): what it measured, what is not 640x480 at 60 Hz
  [/^640×480 · (.+) Hz · line (.+) µs · (\d+) lines$/, '640×480 · $1 Hz · linha de $2 µs · $3 linhas'],
  [/^640×480 · line (.+) µs · no VSYNC$/, '640×480 · linha de $1 µs · sem VSYNC'],
  [/^HSYNC every (.+) µs \((.+) kHz\): 31\.8 µs \(31\.5 kHz\) expected for 640×480 at 60 Hz$/, 'HSYNC a cada $1 µs ($2 kHz): esperado 31,8 µs (31,5 kHz) em 640×480 a 60 Hz'],
  [/^HSYNC pulse of (.+) µs: 3\.8 µs \(96 pixels\) expected$/, 'Impulso de HSYNC de $1 µs: esperado 3,8 µs (96 píxeis)'],
  [/^(.+) lines a frame: 525 expected$/, '$1 linhas por imagem: esperadas 525'],
  [/^(.+) Hz: 60 Hz expected$/, '$1 Hz: esperado 60 Hz'],
  [/^VSYNC pulse of (.+) lines: 2 expected$/, 'Impulso de VSYNC de $1 linhas: esperadas 2'],
  [/^t = (.+?) · ([\d,.\s]+) cycles(.*)$/, (m, tm, n, rest) => `t = ${tm} · ${n.replace(/,/g, '\u00a0')} ciclos${rest.replace('% of real time)', '% do tempo real)').replace(' · stopped by an error', ' · parado por um erro').replace(' · paused while hidden', ' · em pausa enquanto oculto')}`],
  [/^(\d+) port bit\(s\) have no LOC on a (.+) resource \(inputs are held at 0\):$/, '$1 bit(s) de porto sem LOC num recurso da $2 (as entradas ficam a 0):'],
  // print dialog
  [/^Print — (.*)$/, 'Imprimir — $1'],
  [/^The first (\d+) of (\d+) rows$/, 'As primeiras $1 de $2 linhas'],   // (SSim's print, #1511)
  [/^(\d+) pages? \((\d+) across × (\d+) down\), (\S+) (landscape|portrait); 12 px text prints at ([\d.]+) pt$/,
    (m, n, c, r, p, o, pt) => `${n} página${n === '1' ? '' : 's'} (${c} na horizontal × ${r} na vertical), ${p} ${o === 'landscape' ? 'horizontal' : 'vertical'}; texto de 12 px impresso a ${pt} pt`],
  [/^Drawing: (\d+) × (\d+) px\. Large diagrams: several pages across \(tiles\) or A3; text below ~5 pt is hard to read on paper\. For a PDF choose "Save as PDF" in the print dialog \(keep the margins at "Default"\)\.$/,
    'Desenho: $1 × $2 px. Diagramas grandes: várias páginas na horizontal (mosaico) ou A3; texto abaixo de ~5 pt é difícil de ler em papel. Para um PDF escolha "Guardar como PDF" no diálogo de impressão (mantenha as margens em "Predefinição").'],
);

// the schematic editor's Add Wire hint (sch-render.js): a wire drawn as a stroke too (#1052)
Object.assign(PT, {
  'Add Wire: click to start, click to add a bend, click on a pin/wire or double-click to finish; or draw a stroke from a pin/wire to another. Esc ends the wire.':
    'Adicionar Fio: clique para começar, clique para fazer um canto, clique num pino/fio ou faça duplo clique para terminar; ou desenhe um traço de um pino/fio até outro. Esc termina o fio.',
});

// live schematic simulation (sch-live.js): Try it, not Simulate (the design flow's, #992)
Object.assign(PT, {
  'Simulate': 'Simular', 'Try it': 'Experimentar', 'Try it: click the inputs and watch the circuit work (Esc to stop)': 'Experimentar: clique nas entradas e veja o circuito a funcionar (Esc para parar)',
  'Try it: click the inputs (switches, bus values, clocks), hover a wire or pin to see its value, drag to pan. Esc stops.':
    'Experimentar: clique nas entradas (interruptores, valores de barramentos, relógios), passe o rato sobre um fio ou pino para ver o valor, arraste para deslocar. Esc para.',
  'Building the circuit\'s model…': 'A construir o modelo do circuito…',
  'Power cycle: back to time 0, registers and inputs to their initial values': 'Religar: volta ao tempo 0, registos e entradas com os valores iniciais',
  'Step': 'Passo', 'One clock cycle (rising and falling edge)': 'Um ciclo de relógio (flanco ascendente e descendente)', 'Pause': 'Pausa',
  'Run / pause the clock': 'Executar / pausar o relógio', 'Clock rate': 'Frequência do relógio', 'Buses:': 'Barramentos:',
  'Number format of the bus values': 'Formato dos valores dos barramentos',
  'Stop trying it out and go back to the schematic (Esc)': 'Parar de experimentar e voltar ao esquemático (Esc)', 'Number format': 'Formato do número',
  'Subtract 1': 'Subtrair 1', 'Add 1': 'Somar 1', 'All bits 0': 'Todos os bits a 0', 'Set': 'Aplicar',
  'Hex 0x1F, binary 0b101, or decimal; ↑ / ↓ add / subtract 1': 'Hex 0x1F, binário 0b101 ou decimal; ↑ / ↓ somam / subtraem 1',
  'Click an input to change it: 1-bit inputs toggle, buses open a value editor, clock inputs step one cycle. Wires: green = 1, dark green = 0, red = X/U, blue = Z. Hover a pin or a wire to see its value; click a component to list its pins.':
    'Clique numa entrada para a mudar: as entradas de 1 bit comutam, os barramentos abrem um editor de valor, as entradas de relógio avançam um ciclo. Fios: verde = 1, verde escuro = 0, vermelho = X/U, azul = Z. Passe o rato sobre um pino ou fio para ver o valor; clique num componente para listar os seus pinos.',
  'click for one clock cycle': 'clique para um ciclo de relógio', 'click to toggle': 'clique para comutar', 'click to change the value': 'clique para mudar o valor',
  'no value': 'sem valor', '(unconnected)': '(não ligado)',
});
// the ISE style title bar (web/js/project.js updateTitle, #987): "<project> - [Design Summary]", its name translated (#1007)
PT_PATTERNS.push([/^(.+) - \[Design Summary\]$/, (m, pj) => `${pj} - [${PT['Design Summary']}]`]);
// a task's button with its dot (web/js/tasks.js taskTitle, #991): "Implement — done with warnings"
PT_PATTERNS.push([/^(Design|Simulate|Implement) — (done, no warnings|done with warnings|errors|out of date \(a source changed\)|running…)$/, (m, a, b) => `${a === 'Design' ? TASK_PT.Design : PT[a]} — ${PT[b]}`]);   // (the Design task: Projetar, #4953)
PT_PATTERNS.push(
  [/^Stopped: (.*)$/s, 'Parado: $1'],
  [/^Simulation stopped: (.*)$/s, 'Simulação parada: $1'],
);
// New Source types, Module Wizard and Schematic Wizard (web/js/modwizard.js, core/modgen.js)
Object.assign(PT, {
  'Module (HDL)': 'Módulo (HDL)', 'C Function (HLS)': 'Função C (HLS)', 'C++ Function (HLS)': 'Função C++ (HLS)', 'Generated from the C': 'Gerado a partir do C',
  'View State Machine (ASM)': 'Ver Máquina de Estados (ASM)', 'Read-only, the state machine made from': 'Só de leitura, a máquina de estados feita de', 'The state machine made from the C (read-only)': 'A máquina de estados feita do C (só de leitura)',
  'View C Model': 'Ver Modelo C',
  'C Synthesis (HLS)': 'Síntese de C (HLS)', 'View/Edit C Source': 'Ver/Editar Fonte C', 'View C Synthesis Report': 'Ver Relatório da Síntese de C', 'View Generated HDL': 'Ver HDL Gerado',
  'C Simulation': 'Simulação de C', 'C/RTL Co-simulation': 'Co-simulação C/RTL', 'Run the test bench, main()': 'Correr o test bench, main()', "Replay main()'s calls of the top function on its HDL and compare": 'Repetir no seu HDL as chamadas que main() faz à função de topo, e comparar',
  // New Source's types (#975; Schematic and Petri Net: their own entries)
  'Finite State Machine (FSM)': 'Máquina de Estados Finitos (FSM)', 'Algorithmic State Machine (ASM)': 'Máquina de Estados Algorítmica (ASM)', 'Test Bench': 'Bancada de Teste',
  'Clock Manager (DCM / PLL)': 'Gestor de Relógio (DCM / PLL)',
  'Module Wizard': 'Assistente de Módulo', 'Schematic Wizard': 'Assistente de Esquemático',
  'Name and Language': 'Nome e Linguagem', 'Inputs and Outputs': 'Entradas e Saídas', 'Kind of Logic': 'Tipo de Lógica',
  'The wizard creates a schematic with an I/O marker for each input and output, ready for you to place the symbols and wire them.':
    'O assistente cria um esquemático com um marcador de E/S para cada entrada e saída, pronto para colocar os símbolos e ligá-los.',
  'The wizard writes a commented skeleton of the module: its inputs and outputs, and a template of the logic (combinational or sequential).':
    'O assistente escreve um esqueleto comentado do módulo: as entradas e saídas, e um modelo da lógica (combinatória ou sequencial).',
  'Schematic (module) name:': 'Nome do esquemático (módulo):', 'Module name:': 'Nome do módulo:', 'Description (optional):': 'Descrição (opcional):',
  'What the module does (it goes into the header comment)': 'O que o módulo faz (vai para o comentário de cabeçalho)',
  'Width (bits)': 'Largura (bits)',
  '1 = a single bit; N = a bus of N bits (N-1 downto 0)': '1 = um só bit; N = um barramento de N bits (N-1 downto 0)',
  'Description': 'Descrição', 'output': 'saída', 'optional': 'opcional', 'Add Port': 'Adicionar Porto',
  'No ports yet: use Add Port.': 'Ainda sem portos: use Adicionar Porto.',
  'One assignment per output (concurrent)': 'Uma atribuição por saída (concorrente)', 'One process / always block that reads every input': 'Um processo / bloco always que lê todas as entradas',
  'No reset': 'Sem reset', 'Synchronous (at the clock edge)': 'Síncrono (no flanco do relógio)', 'Asynchronous (at once)': 'Assíncrono (imediato)',
  "Active high ('1')": "Ativo a 1 ('1')", "Active low ('0')": "Ativo a 0 ('0')",
  'Style:': 'Estilo:', 'Reset:': 'Tipo de reset:', 'Reset input:': 'Entrada de reset:', 'Enable input:': 'Entrada de habilitação:',
  'Combinational: the outputs depend only on the present inputs (gates, multiplexers, adders, decoders…). Every output gets a default value, so no latch is made.':
    'Combinatória: as saídas dependem só das entradas atuais (portas, multiplexadores, somadores, descodificadores…). Cada saída recebe um valor por omissão, por isso não se cria nenhuma latch.',
  'Sequential: the outputs are registers that change at the rising edge of the clock (counters, shift registers, state machines…). The reset sets them to 0.':
    'Sequencial: as saídas são registos que mudam no flanco ascendente do relógio (contadores, registos de deslocamento, máquinas de estados…). O reset põe-nos a 0.',
  'Combinational': 'Combinatória', 'Sequential (clocked)': 'Sequencial (com relógio)', 'Default value': 'Valor por omissão',
  'Generics (optional)': 'Genéricos (opcional)', 'Add Generic': 'Adicionar Genérico',
  'Constants given when the module is used, e.g. a width (VHDL generic, Verilog parameter).': 'Constantes dadas quando o módulo é usado, p. ex. uma largura (generic em VHDL, parameter em Verilog).',
  'Preview of the code:': 'Pré-visualização do código:',
  'shown on the sheet': 'mostrada na folha', 'shown on the sheet and as a comment in the HDL': 'mostrada na folha e como comentário no HDL',
  'Add at least one input or output.': 'Adicione pelo menos uma entrada ou saída.',
  'A sequential module needs a clock: add a 1-bit input (e.g. clk) on the previous page.': 'Um módulo sequencial precisa de um relógio: adicione uma entrada de 1 bit (p. ex. clk) na página anterior.',
  'Choose the reset input, or No reset.': 'Escolha a entrada de reset, ou Sem reset.',
  'The clock and the reset must be different inputs.': 'O relógio e o reset têm de ser entradas diferentes.',
  'The enable must be an input other than the clock and the reset.': 'A habilitação tem de ser uma entrada diferente do relógio e do reset.',
  'A sequential module needs a clock: a 1-bit input.': 'Um módulo sequencial precisa de um relógio: uma entrada de 1 bit.',
  'The reset must be a 1-bit input other than the clock.': 'O reset tem de ser uma entrada de 1 bit diferente do relógio.',
  'The enable must be a 1-bit input other than the clock and the reset.': 'A habilitação tem de ser uma entrada de 1 bit diferente do relógio e do reset.',
});
// identifier problems (core/modgen.js identError), inside the messages below
const ptIdent = s => s
  .replace(/^the name is empty$/, 'o nome está vazio')
  .replace(/^('.*') must start with a letter$/, '$1 tem de começar por uma letra')
  .replace(/^('.*') may only contain letters, digits and _$/, '$1 só pode ter letras, dígitos e _')
  .replace(/^('.*'): no double __ and no _ at the end$/, '$1: sem __ seguidos e sem _ no fim')
  .replace(/^('.*') is a reserved word of (.+)$/, (m, n, l) => `${n} é uma palavra reservada de ${l.replace(' and ', ' e ')}`);
PT_PATTERNS.push(
  // a name that is a reserved word of VHDL or Verilog (core/reserved.js, #679): refused, or said of a drawing / a module
  [/^'(.*)' is a reserved word of (.+): choose another name\.$/, (m, n, l) => `'${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: escolha outro nome.`],
  [/^'(.*)' is a reserved word of (.+): rename it$/, (m, n, l) => `'${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: mude-lhe o nome`],
  [/^(\S+): '(.*)' is a reserved word of (.+): rename the module in the file first\.$/, (m, f, n, l) => `${f}: '${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: mude primeiro o nome do módulo no ficheiro.`],
  [/^The module name '(.*)' is a reserved word of (.+): rename it \(Rename in the Design pane\), or its HDL may not compile\.$/, (m, n, l) => `O nome do módulo '${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: mude-lhe o nome (Mudar o Nome no painel Projeto), ou o seu HDL pode não compilar.`],
  [/^(Name|Module name|Architecture name|Generic|Port (\d+)): (.*)\.$/, (m, w, k, e) => `${{ Name: 'Nome', 'Module name': 'Nome do módulo', 'Architecture name': 'Nome da arquitetura', Generic: 'Genérico' }[w] || `Porto ${k}`}: ${ptIdent(e)}.`],
  [/^Port '(.*)' has the name of the module\.$/, "O porto '$1' tem o nome do módulo."],
  [/^Two ports are named '([^']*)'\.$/, "Há dois portos com o nome '$1'."],
  [/^Two ports are named '([^']*)' \(letter case does not count: '([^']*)'\)\.$/, "Há dois portos com o nome '$1' (maiúsculas e minúsculas não contam: '$2')."],
  [/^Port '(.*)': the width must be a whole number from 1 to (\d+)\.$/, "Porto '$1': a largura tem de ser um número inteiro de 1 a $2."],
  [/^The generic '(.*)' has the name of a port or of another generic\.$/, "O genérico '$1' tem o nome de um porto ou de outro genérico."],
  [/^The generic '(.*)' has the name of a port or of the module\.$/, "O genérico '$1' tem o nome de um porto ou do módulo."],
  [/^Generic '(.*)': the default value must be a whole number\.$/, "Genérico '$1': o valor por omissão tem de ser um número inteiro."],
  [/^A module named '(.*)' already exists\.$/, "Já existe um módulo chamado '$1'."],
  [/^(\S+) already exists\.$/, '$1 já existe.'],
  [/^Open-source components \((\d+)\)$/, 'Componentes de código aberto ($1)'],
  [/^Copyright 2026 Pedro Maló\. Free software under the GNU Affero General Public License v3\.0 \($/, 'Copyright 2026 Pedro Maló. Software livre sob a GNU Affero General Public License v3.0 ('],

  [/^Removed (\S+) from the project$/, 'Removido $1 do projeto'],
  [/^Delete '(\S+)' from the disk\?\n\(It cannot be undone: Remove from Project keeps the file in the project folder\.\)$/, "Apagar '$1' do disco?\n(Não se pode anular: Remover do Projeto mantém o ficheiro na pasta do projeto.)"],
  [/^Delete '(\S+)'\?\n\(It is moved to the workspace's \.trash folder, from where you can move it back\. Remove from Project keeps the file in the project folder\.\)$/, "Apagar '$1'?\n(É movido para a pasta .trash da área de trabalho, de onde o pode repor. Remover do Projeto mantém o ficheiro na pasta do projeto.)"],
  [/^Delete the folder '(.+)' and the (\d+) file\(s\) in it from the project\?\n\(They are moved to the workspace's \.trash folder, from where you can move them back\.\)\n\n([\s\S]*)$/, "Apagar a pasta '$1' e o(s) $2 ficheiro(s) que contém do projeto?\n(São movidos para a pasta .trash da área de trabalho, de onde os pode repor.)\n\n$3"],
  // Remove from Project: one file; a drawing with its HDL file, together (#234)
  [/^Remove '(\S+)' from the project\?\n\(The file stays in the project folder: Undo or Add to Project in the Files view brings it back\.\)$/, "Remover '$1' do projeto?\n(O ficheiro fica na pasta do projeto: Anular ou Acrescentar ao Projeto na vista Ficheiros repõe-no.)"],
  [/^Remove '(\S+)' and its HDL file '(\S+)' from the project\?\n\(The files stay in the project folder: Undo or Add to Project in the Files view brings them back\.\)$/, "Remover '$1' e o seu ficheiro HDL '$2' do projeto?\n(Os ficheiros ficam na pasta do projeto: Anular ou Acrescentar ao Projeto na vista Ficheiros repõe-nos.)"],
  [/^Removed (\S+) and (\S+) from the project$/, 'Removidos $1 e $2 do projeto'],
  [/^The project starts with (\S+) \(the top module 'top'\)\.$/, "O projeto começa com $1 (o módulo de topo 'top')."],
  [/^The project starts with (\S+) \(the top module 'top'\) and its HDL module, generated from it\.$/, "O projeto começa com $1 (o módulo de topo 'top') e o seu módulo HDL, gerado a partir dele."],
  [/^(\S+) already exists\.\n\nReplace it\? Its current contents will be lost\.$/, '$1 já existe.\n\nSubstituir? O conteúdo atual perde-se.'],
  [/^(\S+) already exists: choose another name\.$/, '$1 já existe: escolha outro nome.'],
  // Convert to Schematic (editable) of any HDL module (#225)
  [/^Convert to Schematic$/, 'Converter para Esquemático'],
  [/^(\S+) already exists\. Overwrite it\?$/, '$1 já existe. Substituí-lo?'],
  [/^Converting (\S+) to a schematic…$/, 'A converter $1 para esquemático…'],
  [/^'(.+)' does not elaborate( \(.*\))?: correct it first\.$/s, "'$1' não é elaborado$2: corrija-o primeiro."],
  [/^Not converted: the HDL generated from the schematic of '(.+?)' would not compile as the module does \((.*)\)\.$/s, "Não convertido: o HDL gerado a partir do esquemático de '$1' não compilaria como o módulo ($2)."],
  [/^The schematic of '(.+?)' cannot make its HDL: (.*)$/s, "O esquemático de '$1' não consegue gerar o seu HDL: $2"],
  [/^The text of '(.+?)' is not found in (\S+)\.$/, "O texto de '$1' não foi encontrado em $2."],
  [/^No module '(.+?)' in the project\.$/, "Não há nenhum módulo '$1' no projeto."],
  [/^'(.+?)' is not an HDL module\.$/, "'$1' não é um módulo HDL."],
  // a drawing whose HDL file name is taken (#230): the tip of its [No HDL] badge, Generate HDL File…, the New Source wizards
  // (a design project's, #3891: its module named, Make Module…)
  [/^Not made: another file of the project folder defines its module (\S+)\. Make Module… \(right-click\) replaces it with the drawing's\.$/, 'Não gerado: outro ficheiro da pasta do projeto já define o seu módulo $1. Gerar Módulo… (botão direito) substitui-o pelo do desenho.'],
  [/^Not made: its module (\S+) is the module of (\S+)\. Rename one of them\.$/, 'Não gerado: o seu módulo $1 é o módulo de $2. Mude o nome de um deles.'],
  [/^Another file of the project folder defines the module (\S+) already\.\n\nReplace it with the module of (\S+)\? Its current contents will be lost\.$/, 'Outro ficheiro da pasta do projeto já define o módulo $1.\n\nSubstituí-lo pelo módulo de $2? O seu conteúdo atual perde-se.'],
  [/^The module of (\S+) was removed from the project\.\n\nMake it again from (\S+) and put it back in the project\?$/, 'O módulo de $1 foi retirado do projeto.\n\nGerá-lo de novo a partir de $2 e repô-lo no projeto?'],
  [/^No HDL file: (\S+) defines its module (\S+) already\. Generate HDL File… \(right-click\) replaces it with the HDL generated from the drawing\.$/, 'Sem ficheiro HDL: $1 já define o seu módulo $2. Gerar Ficheiro HDL… (botão direito) substitui-o pelo HDL gerado a partir do desenho.'],
  [/^No HDL file: (\S+) holds something else\. Generate HDL File… \(right-click\) writes its HDL to (\S+)\.$/, 'Sem ficheiro HDL: $1 contém outra coisa. Gerar Ficheiro HDL… (botão direito) escreve o seu HDL em $2.'],
  [/^No HDL file: its module (\S+) is the module of (\S+)\. Rename one of them\.$/, 'Sem ficheiro HDL: o seu módulo $1 é o módulo de $2. Mude o nome de um deles.'],
  // its HDL file removed from the project (#231)
  [/^No HDL file: its HDL file (\S+) was removed from the project\. Generate HDL File… \(right-click\) makes it again from the drawing\.$/, 'Sem ficheiro HDL: o seu ficheiro HDL $1 foi removido do projeto. Gerar Ficheiro HDL… (botão direito) gera-o de novo a partir do desenho.'],
  [/^(\S+), the HDL file of (\S+), was removed from the project\.\n\nMake it again from (\S+) and put it back in the project\? Its current contents will be lost\.$/, '$1, o ficheiro HDL de $2, foi removido do projeto.\n\nGerá-lo de novo a partir de $3 e repô-lo no projeto? O conteúdo atual perde-se.'],
  [/^(\S+) defines the module (\S+) already\.\n\nReplace it with the HDL generated from (\S+)\? Its current contents will be lost\.$/, '$1 já define o módulo $2.\n\nSubstituí-lo pelo HDL gerado a partir de $3? O conteúdo atual perde-se.'],
  [/^(\S+) has errors: correct them first\.$/, '$1 tem erros: corrija-os primeiro.'],
  [/^(\S+) already exists: the HDL generated from the new source would be written there\. Choose another name\.$/, '$1 já existe: o HDL gerado a partir da nova fonte seria escrito aí. Escolha outro nome.'],
  // Back-annotate Pin Locations: the pins to add to the UCF
  [/^Add the (\d+) pin location\(s\) chosen by the tools to (.+?)\?\n\n([\s\S]*)$/, 'Adicionar a $2 as $1 localizações de pinos escolhidas pelas ferramentas?\n\n$3'],
);
// a development build's version (core/version.js VERSION_LABEL, #135): in the title bar, the Design
// Summary, the start-up message; the last pattern tried (a text no other pattern translates)
// Help ▸ Check for Updates (#198): the application's (GitHub's releases) and the site's (the page it serves)
Object.assign(PT, {
  'It is the version this site serves.': 'É a versão que este site serve.',
  'This is the development edition, built from the latest code (main): it is updated after every change, before the releases.': 'Esta é a edição de desenvolvimento, construída a partir do código mais recente (main): é atualizada a cada alteração, antes das versões.',
  'Releases:': 'Versões:', 'Reload': 'Recarregar', "What's new:": 'Novidades:', 'Release notes and downloads:': 'Notas da versão e transferências:',
  'release notes': 'notas da versão', 'You are running a development version newer than the latest release.': 'Está a usar uma versão de desenvolvimento mais recente do que a última versão publicada.',
  'To update: download silinx-<version>.zip and replace your Silinx folder (your projects in the workspace are kept), or download the new Silinx.html for the standalone edition.':
    'Para atualizar: descarregue o silinx-<versão>.zip e substitua a pasta do Silinx (os projetos da área de trabalho mantêm-se), ou descarregue o novo Silinx.html para a edição autónoma.',
});
const ptLabel = v => v;   // a version label in a sentence (dev:<commit> (<date>): the same in Portuguese)
PT_PATTERNS.push(
  [/^Running Silinx (.+)\. Checking for a newer version…$/, (m, v) => `A executar o Silinx ${ptLabel(v)}. A procurar uma versão mais recente…`],
  [/^Running Silinx (.+)\.$/, (m, v) => `A executar o Silinx ${ptLabel(v)}.`],
  [/^Silinx (.+) is up to date\.$/, (m, v) => `O Silinx ${ptLabel(v)} está atualizado.`],
  [/^This site now serves Silinx (.+)\.$/, (m, v) => `Este site serve agora o Silinx ${ptLabel(v)}.`],
  [/^This page is (.+): reload the page to get the new version \(your projects are kept\)\.$/, (m, v) => `Esta página é a ${ptLabel(v)}: recarregue a página para obter a nova versão (os projetos mantêm-se).`],
  [/^A new version is available: Silinx (.+)$/, 'Está disponível uma nova versão: Silinx $1'],
  [/^\(released (.+)\)$/, '(publicada a $1)'],
  [/^You are running (.+)\.$/, (m, v) => `Está a usar a ${ptLabel(v)}.`],
  [/^Latest release on GitHub: (.+) —$/, 'Última versão no GitHub: $1 —'],
  [/^Could not check for updates: (.+)\.$/, 'Não foi possível procurar atualizações: $1.'],
);
Object.assign(PT, TT_PT); PT_PATTERNS.unshift(...TT_PT_PATTERNS);   // Boolean Algebra / Karnaugh Map tool
Object.assign(PT, INK_PT); PT_PATTERNS.unshift(...INK_PT_PATTERNS);   // the handwritten input (#1056)
Object.assign(PT, IO_PT); PT_PATTERNS.unshift(...IO_PT_PATTERNS);   // bidirectional (inout) ports of the wizards
Object.assign(PT, LINT_PT);   // design checks (the help texts of the messages are in core/hints.js)
Object.assign(PT, EDITOR_PT); PT_PATTERNS.unshift(...EDITOR_PT_PATTERNS);   // HDL editor: Rename Symbol, quick fixes
// a module's labels, but those already translated, and its patterns, ahead of the ones before (#4041)
const keep = (strings, patterns = []) => { for (const [k, v] of Object.entries(strings)) if (!(k in PT)) PT[k] = v; PT_PATTERNS.unshift(...patterns); };
keep(FSM_PT, FSM_PT_PATTERNS);   // FSM state diagram editor (existing translations kept)
keep(PETRI_PT, PETRI_PT_PATTERNS);   // Petri net editor
keep(CIRCUIT_PT, CIRCUIT_PT_PATTERNS);   // digital circuit editor (#3897)
keep(SYMBOL_PT, SYMBOL_PT_PATTERNS);   // Symbol Editor (#3755)
keep(FPGA_PT, FPGA_PT_PATTERNS);   // View Implemented Design (FPGA)
keep(SCH_PT, SCH_PT_PATTERNS);   // schematic editor, RTL / Technology Schematic (#130)
keep(CLOCKING_PT);   // the Clocking Wizard (#793)
keep(MEMORY_PT, MEMORY_PT_PATTERNS);   // the Block Memory wizard (#794)
PT_PATTERNS.unshift(...CLOCKING_PT_PATTERNS,
  [/^(Input port|Reset input|LOCKED output|Output (\w+)): (.*)\.$/, (m, w, o, e) => `${{ 'Input port': 'Porto de entrada', 'Reset input': 'Entrada de reset', 'LOCKED output': 'Saída LOCKED' }[w] || `Saída ${o}`}: ${ptIdent(e)}.`]);
keep(WIZARDS_PT, WIZARDS_PT_PATTERNS);   // the FSM, ASM and UCF wizards (#2082)
keep(LINK_PT, LINK_PT_PATTERNS);   // a design's link (#2826)
keep(VERIFY_PT, VERIFY_PT_PATTERNS);   // Verify Equivalence (#3177)
keep(GIT_PT, GIT_PT_PATTERNS);   // git (#3195)
keep(MERGE_PT, MERGE_PT_PATTERNS);   // Merge Contribution… (#4206)
keep(COLLAB_PT, COLLAB_PT_PATTERNS);   // a shared project (#3181)
keep(RESOURCES_PT, RESOURCES_PT_PATTERNS);   // the device's resources checked against the design (#796)
keep(PINS_PT, PINS_PT_PATTERNS);   // I/O Pin Planning's Board view (#2694)
keep(LABS_PT, LABS_PT_PATTERNS);   // the guided labs (#3179)
keep(GRADE_PT, GRADE_PT_PATTERNS);   // the graded exercises (#3192)
keep(CAPTURE_PT, CAPTURE_PT_PATTERNS);   // the logic analyzer (#3176)
keep(PROGRAM_PT, PROGRAM_PT_PATTERNS);   // the open families' Configure Target Device (#2298)
keep(SUMMARY_PT, SUMMARY_PT_PATTERNS);   // the Design Summary's values (#4518)
keep(MESSAGES_PT, MESSAGES_PT_PATTERNS);   // toasts, dialogs, plain elements' texts (#3539), template literals' (#4748)

export const LOCALES = {
  en: { name: 'English', strings: {}, patterns: [] },
  pt: { name: 'Português', strings: PT, patterns: PT_PATTERNS },
};

const KEY = prefKey('silinx.lang');
let lang = 'en';
try { lang = localStorage.getItem(KEY) || ''; } catch { /* storage unavailable */ }
if (!LOCALES[lang]) lang = /^pt\b/i.test(navigator.language || '') ? 'pt' : 'en';

export const getLanguage = () => lang;

/** Translate an English UI string (exact match or pattern) into the current language. */
export function t(text) {
  if (lang === 'en' || text == null) return text;
  const L = LOCALES[lang];
  const s = String(text);
  const key = s.trim();
  if (!key) return s;
  let out = L.strings[key];
  if (out === undefined) {
    for (const [re, rep] of L.patterns) if (re.test(key)) { out = key.replace(re, rep); break; }   // rep: string or function
  }
  if (out === undefined) return s;
  return s.replace(key, () => out);    // keep surrounding whitespace ($& or $' in the text is text, #1232)
}

// ---------------------------------------------------------------- DOM translation
const SKIP = '.cm-editor, .console-page, pre, code, textarea, [data-no-i18n], #hier .lbl, #libs-page .lbl, svg text, .sch-svg, .xl-hover-tip';
const ATTRS = ['title', 'placeholder', 'aria-label'];
const textState = new WeakMap();   // text node -> { orig, last }
const attrState = new WeakMap();   // element -> { [attr]: { orig, last } }

function skipEl(el) { return !el || (el.closest && el.closest(SKIP)); }
// a text box: its text (the user's) left as it is, its own attributes (placeholder, tip) translated as an input's (#3931)
const isBox = el => el?.tagName === 'TEXTAREA';
// a task's name inside an element that says so (data-i18n-task="Design": the Design task's button and page, #4953)
const TASK_PT = { Design: 'Projetar' };   // (a verb as Simular, Emular, Implementar; not the Design pane's "Projeto")
const asTask = (el, text) => lang === 'pt' && el?.closest?.('[data-i18n-task]')?.dataset.i18nTask === text.trim() ? text.replace(text.trim(), TASK_PT[text.trim()]) : null;

function translateText(node) {
  const parent = node.parentElement;
  if (!parent || skipEl(parent) || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;
  const cur = node.nodeValue;
  let st = textState.get(node);
  if (!st || cur !== st.last) { st = { orig: cur, last: cur }; textState.set(node, st); }
  const next = asTask(parent, st.orig) ?? t(st.orig);
  if (next !== cur) { st.last = next; node.nodeValue = next; } else st.last = cur;
}

function translateAttrs(el) {
  if (skipEl(isBox(el) ? el.parentElement : el)) return;
  let map = attrState.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    if (!map) { map = {}; attrState.set(el, map); }
    let st = map[a];
    if (!st || cur !== st.last) st = map[a] = { orig: cur, last: cur };
    const next = asTask(el, st.orig) ?? t(st.orig);
    if (next !== cur) { st.last = next; el.setAttribute(a, next); }
  }
}

function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (isBox(root)) return translateAttrs(root); if (skipEl(root)) return; translateAttrs(root); }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    // (a text box: its attributes, not its text)
    acceptNode: n => (n.nodeType === 1 && n.matches?.(SKIP) ? (isBox(n) && translateAttrs(n), NodeFilter.FILTER_REJECT) : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) translateText(n); else translateAttrs(n);
  }
}

let observer = null;
let docTitle = { orig: null, last: null };
function translateTitle() {
  if (document.title !== docTitle.last) docTitle.orig = document.title;
  docTitle.last = t(docTitle.orig);
  if (document.title !== docTitle.last) document.title = docTitle.last;
}

export function startI18n() {
  document.documentElement.lang = lang;
  translateTree(document.body);
  translateTitle();
  if (observer) return;
  observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(n => translateTree(n));
      else if (m.type === 'characterData') translateText(m.target);
      else if (m.type === 'attributes' && ATTRS.includes(m.attributeName)) translateAttrs(m.target);
    }
    translateTitle();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// views that render their own texts per language (e.g. the Symbol Info datasheets) re-render on a change
const langListeners = new Set();
/** Call fn(lang) after every language change; returns the function that removes the listener. */
export function onLanguageChange(fn) { langListeners.add(fn); return () => langListeners.delete(fn); }

export function setLanguage(next) {
  if (!LOCALES[next] || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  translateTree(document.body);     // re-translate from the stored English originals
  translateTitle();
  for (const fn of [...langListeners]) { try { fn(lang); } catch (e) { console.error(e); } }
}
