// Portuguese strings of the texts the label scan of test/web-i18n.test.js did not reach before #3539: toasts, dialogs'
// titles and messages, the errors a dialog returns, plain elements' texts (div, p, span, option) and texts set through
// textContent (merged into the dictionary of i18n.js); and (#4748) the messages written as template literals, which the
// scan reads since: the commands' errors, the documents' tab titles, the wizards' "created", SSim's status line, a
// schematic's title block. A part of a message that is a message of its own (an error's text) is translated too, by
// t(), read when a text is translated, never on load.
import { t } from './i18n.js';

export const MESSAGES_PT = {
  // toasts (web/js/app.js, viewers.js)
  'Use Ctrl+V to paste': 'Use Ctrl+V para colar',
  'Select the top module first': 'Selecione primeiro o módulo de topo',
  // dialogs' titles (app.js, drawings.js, menus.js, wizards.js)
  'Undo / Redo': 'Anular / Refazer', 'Convert to State Machine': 'Converter para Máquina de Estados',
  'Open Project Bundle': 'Abrir Pacote do Projeto', 'Replace Project': 'Substituir Projeto',
  // dialogs' messages (app.js, implement.js, project.js, tbwizard.js, viewers.js, wizards.js)
  'Select a top-level module first.': 'Selecione primeiro um módulo de topo.',
  'Enter a folder path inside the project.': 'Escreva um caminho de pasta dentro do projeto.',
  'A folder cannot be moved into itself.': 'Uma pasta não pode ser movida para dentro de si mesma.',
  'In the browser edition, choose Silinx as the synthesis tool (Project > Design Properties): Synthesize then runs Yosys in the browser, and so does Implement Design.':
    'Na edição para o navegador, escolha o Silinx como ferramenta de síntese (Projeto > Propriedades do Projeto): Sintetizar corre então o Yosys no navegador, e o mesmo faz Implementar o Projeto.',
  'An implementation is running: stop it (or wait for it to finish) first.': 'Está uma implementação em curso: pare-a (ou espere que termine) primeiro.',
  'The project has no design modules to test.': 'O projeto não tem módulos de projeto para testar.',
  'The project has no board. Choose one in Project ▸ Design Properties (e.g. Digilent Basys2).':
    'O projeto não tem placa. Escolha uma em Projeto ▸ Propriedades do Projeto (p. ex. Digilent Basys2).',
  'Select the project folder or the .zip of the Silinx project.': 'Selecione a pasta do projeto ou o .zip do projeto Silinx.',
  // the errors a dialog returns (rename.js, tbwizard.js, tbwizard-vectors.js)
  'Enter a file path inside the project.': 'Escreva um caminho de ficheiro dentro do projeto.',
  'The module name must start with a letter and contain only letters, digits and _.': 'O nome do módulo tem de começar por uma letra e ter só letras, algarismos e _.',
  'Add at least one vector.': 'Acrescente pelo menos um vetor.',
  'Enter a valid test bench name (a letter, then letters, digits and _).': 'Escreva um nome de bancada de teste válido (uma letra, depois letras, algarismos e _).',
  'The clock and the reset must be different ports.': 'O relógio e o reset têm de ser portos diferentes.',
  'The clock period must be at least 2 ns.': 'O período do relógio tem de ser pelo menos 2 ns.',
  'The settling time must be at least 1 ns.': 'O tempo de estabilização tem de ser pelo menos 1 ns.',
  // plain elements' texts and textContent (asm-inspector.js, console.js, impact.js, pinplanner.js, tbwizard*.js)
  'Drag to move them together, or delete them.': 'Arraste para os mover juntos, ou apague-os.',
  'asynchronous': 'assíncrono', 'synchronous': 'síncrono', 'default': 'predefinido', 'No messages.': 'Sem mensagens.',
  '(no board / generic JTAG)': '(sem placa / JTAG genérico)',
  'The wizard writes a self-checking test bench: it applies input vectors to the module and compares its outputs with the expected values, reporting each mismatch and TEST PASSED / TEST FAILED at the end.':
    'O assistente escreve uma bancada de teste que se verifica a si mesma: aplica vetores de entrada ao módulo e compara as suas saídas com os valores esperados, assinalando cada diferença e TEST PASSED / TEST FAILED no fim.',
  'One row per test vector: the inputs to apply and the outputs expected. Fill the expected values in by hand (what the design should do), or take them from a simulation of the current design (it then becomes a regression test: check them).':
    'Uma linha por vetor de teste: as entradas a aplicar e as saídas esperadas. Preencha os valores esperados à mão (o que o projeto deve fazer), ou tire-os de uma simulação do projeto atual (passa então a ser um teste de regressão: verifique-os).',
  'Simulating the current design…': 'A simular o projeto atual…',
  'Expected values filled in from the current design: check them!': 'Valores esperados preenchidos a partir do projeto atual: verifique-os!',
  // (#4748)
  // a schematic's title block (drawn in SVG: web/js/sch-render.js)
  SHEET: 'FOLHA', LANGUAGE: 'LINGUAGEM',
  // SSim's Force dialog's empty offset, its error (web/js/isim-dialogs.js), its console's button
  '(never)': '(nunca)', 'Clear console': 'Limpar a consola',
  'invalid time offset': 'desvio de tempo inválido',
  'Open Circuit': 'Abrir Circuito',
};

// (an error's or a list's text, a name kept as it is)
const tr = s => t(s);
// (the device a job is of: "da FPGA", "da flash SPI", "da PROM", "de xc3s250e")
const of = x => ({ 'the FPGA': 'da FPGA', 'the SPI flash': 'da flash SPI', 'the PROM': 'da PROM' }[x] || `de ${x}`);
const failure = e => (e === 'see log' ? 'veja o registo' : tr(e));
export const MESSAGES_PT_PATTERNS = [
  // the commands' errors (their console lines: web/js/console.js logError, commandError)
  [/^cannot open (\S+): ([\s\S]*)$/, (m, p, e) => `não foi possível abrir ${p}: ${tr(e)}`],
  [/^Cannot open (.+) in (.+): ([\s\S]*)$/, (m, p, l, e) => `Não foi possível abrir ${p} em ${l}: ${tr(e)}`],
  [/^cannot parse (\S+): ([\s\S]*)$/, (m, p, e) => `não foi possível ler ${p}: ${tr(e)}`],
  [/^Cannot build the design: ([\s\S]*)$/, (m, e) => `Não foi possível construir o projeto: ${tr(e)}`],
  [/^Cannot save the stimuli: ([\s\S]*)$/, (m, e) => `Não foi possível guardar os estímulos: ${tr(e)}`],
  // (iMPACT's and Program's jobs, web/js/impact.js, program-open.js)
  [/^(Programming|Verifying|Erasing|Backing up) (.+?) failed: ([\s\S]*)$/, (m, w, x, e) => `${{ Programming: 'A programação', Verifying: 'A verificação', Erasing: 'O apagamento', 'Backing up': 'A cópia de segurança' }[w]} ${of(x)} falhou: ${failure(e)}`],
  [/^Reloading the FPGA from the PROM failed: ([\s\S]*)$/, (m, e) => `O recarregamento da FPGA a partir da PROM falhou: ${failure(e)}`],
  [/^(Browse KiCad Libraries|KiCad catalogue|Export Parts as KiCad Package|Import KiCad Part|Edit Symbol|Rename Project|I\/O Pin Planning): ([\s\S]*?)(\.?)$/,
    (m, w, e, dot) => `${{ 'KiCad catalogue': 'Catálogo KiCad' }[w] || tr(w)}: ${tr(e + dot)}`],
  [/^(.+) could not be saved\. Close it and lose the unsaved changes\?$/, '$1 não pôde ser guardado. Fechá-lo e perder as alterações não guardadas?'],
  [/^New path of the folder '(.+)':$/, "Novo caminho da pasta '$1':"],
  [/^(\S+) is too large: (\d+) bytes \(at most (\d+)\)$/, '$1 é demasiado grande: $2 bytes (no máximo $3)'],
  [/^'(.+)' is not a \.kicad_symdir folder$/, "'$1' não é uma pasta .kicad_symdir"],
  [/^'(.+)' is not a \.kicad_sym nor a \.kicad_mod file's name \(letters, digits, \. _ -\)$/, "'$1' não é o nome de um ficheiro .kicad_sym nem .kicad_mod (letras, algarismos, . _ -)"],
  [/^no module '(.+)' in the project's sources$/, "nenhum módulo '$1' nas fontes do projeto"],
  [/^module '(.+)' has no symbol of its own \(a followed project is read only\)$/, "o módulo '$1' não tem um símbolo seu (um projeto seguido é só de leitura)"],
  [/^(\d+) I\/Os assigned from (.+?)((?:; .*)?)\.?$/, (m, n, b, rest) => `${n} E/S atribuídas a partir de ${b}${rest.replace(/; not assigned: /, '; não atribuídas: ').replace(/ by direction /, ' pela direção ')}.`],
  [/^Erase the whole (.+)\? The board will no longer boot a design from flash\.$/, (m, w) => `Apagar toda a ${w === 'SPI flash' ? 'flash SPI' : w}? A placa deixa de arrancar um projeto a partir da flash.`],
  // asked before replacing
  [/^([\s\S]+?)\. Replace the files of the library\?$/, (m, e) => `${tr(e)}. Substituir os ficheiros da biblioteca?`],
  [/^(\S+) is in the project already\. Replace it\?$/, '$1 já está no projeto. Substituí-lo?'],
  [/^(\S+) exists\. Replace it\?$/, '$1 existe. Substituí-lo?'],
  [/^(\S+) already exists in the project\. Replace it with the copy of (.+)\?$/, '$1 já existe no projeto. Substituí-lo pela cópia de $2?'],
  [/^([\s\S]+?)\. Replace it\?$/, (m, e) => `${tr(e)}. Substituí-lo?`],
  [/^Replace the contents of (\S+) by the truth table of '(.+)' \((\d+) input\(s\), (\d+) output\(s\)\)\?$/, "Substituir o conteúdo de $1 pela tabela de verdade de '$2' ($3 entrada(s), $4 saída(s))?"],
  // what was made (the wizards' toasts and console lines)
  [/^(Module|Schematic|Circuit|Petri net|Test bench|Project) (\S+) created$/, (m, k, n) => `${{ Module: 'Módulo', Schematic: 'Esquemático', Circuit: 'Circuito', 'Petri net': 'Rede de Petri', 'Test bench': 'Test bench', Project: 'Projeto' }[k]} ${n} criado`],
  [/^(\S+) created$/, '$1 criado'],
  // the documents' tab titles
  [/^(ASM chart|State diagram|Petri net|Circuit) (\S+)$/, (m, k, n) => `${{ 'ASM chart': 'Fluxograma ASM', 'State diagram': 'Diagrama de estados', 'Petri net': 'Rede de Petri', Circuit: 'Circuito' }[k]} ${n}`],
  [/^(\S+) \(Schematic\)$/, '$1 (Esquemático)'],
  [/^(\S+) \(compare\)$/, '$1 (comparação)'],
  [/^Source Properties - (.+)$/, 'Propriedades da Fonte - $1'],
  [/^as it was in the commit (\w+)$/, 'como estava no commit $1'],
  // the editors
  [/^(\d+) boxes selected$/, '$1 caixas selecionadas'],
  [/^(Undo|Redo) (.+)$/, (m, w, a) => `${w === 'Undo' ? 'Anular' : 'Refazer'} ${tr(a)}`],
  [/^(\S+) \((.+), (.+)\): click it to import it into the project$/, '$1 ($2, $3): clique para o importar para o projeto'],
  // SSim's status line
  [/^Sim Time: (.+)$/, 'Tempo de Simulação: $1'],
  // SSim's Force dialogs' note (#5018)
  [/^Time offsets are relative to the current simulation time \((.+)\); default unit is ns\.$/, 'Os tempos são relativos ao tempo atual da simulação ($1); a unidade por omissão é ns.'],
];
