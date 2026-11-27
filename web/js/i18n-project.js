// Portuguese of the project's application lines (#5254): the Console's lines of the project's lifecycle (a project
// opened, New Source, the wizards' sources, a drawing's HDL made, Remove from Project, Undo / Redo, Rename, Export
// Project, Import Project), drawn in the interface's language while their messages keep their English (appLog, merged
// into the dictionary of i18n.js); the MCP's keep their English. A part of a line that is a label of its own (a source
// type, a wizard's title, a command's name) is translated too, by t(), read when a text is translated.
import { t } from './i18n.js';

// "N source file(s), M other file(s)": an import's counts, whatever its parts (#5253)
const counts = (s) => s.replace(/(\d+) source file\(s\)/g, '$1 ficheiro(s) de fonte').replace(/(\d+) other file\(s\)/g, '$1 outro(s) ficheiro(s)')
  .replace(/(\d+) file\(s\)/g, '$1 ficheiro(s)');
// a part of Rename's line: a module renamed, or a file moved (core/rename-module.js, web/js/rename.js)
const renamed = (p) => p.replace(/^module '(.+)' renamed to '(.+)' \((\d+) file\(s\) updated\)$/, "módulo '$1' passou a chamar-se '$2' ($3 ficheiro(s) atualizado(s))");

export const PROJECT_PT = {
  'Rename: nothing to rename.': 'Mudar o Nome: nada a mudar.',
  // Duplicate… (#5862, web/js/design-duplicate.js, core/duplicate-source.js)
  'Duplicate…': 'Duplicar…', 'The copy is a module of its own, with this name, added to the project.': 'A cópia é um módulo próprio, com este nome, acrescentado ao projeto.',
  'The copy is added to the project.': 'A cópia é acrescentada ao projeto.', 'Choose a file to duplicate.': 'Escolha um ficheiro a duplicar.',
  'build/ is written by Silinx itself.': 'build/ é escrita pelo próprio Silinx.',
};

export const PROJECT_PT_PATTERNS = [
  // a project opened (web/js/project.js)
  [/^Project "(.+)" opened \(a design and simulation project, no FPGA\)\.$/, 'Projeto "$1" aberto (um projeto de desenho e simulação, sem FPGA).'],
  [/^Project "(.+)" opened \((\S+)\)\.$/, 'Projeto "$1" aberto ($2).'],
  [/^Project "(.+)" opened \(the (.+) board\)\.$/, 'Projeto "$1" aberto (a placa $2).'],   // (a processor board's, #5756)
  // New Source… (web/js/new-source.js): its type, its language
  [/^Created (.+?)(?: \((VHDL|Verilog)\))? '(\S+)'\.$/, (m, type, lang, p) => `Nova fonte criada: ${t(type)}${lang ? ` (${lang})` : ''} '${p}'.`],
  // a drawing's HDL made (web/js/drawings.js, core/drawing-sync.js)
  [/^(\S+) generated from (\S+) \(every source has its HDL\)$/, '$1 gerado a partir de $2 (todas as fontes têm o seu HDL)'],
  [/^(\S+) generated from (\S+) \(its HDL file (\S+) was removed from the project\)$/, '$1 gerado a partir de $2 (o seu ficheiro HDL $3 foi removido do projeto)'],
  [/^(\S+) generated from (\S+) \(its HDL file (\S+) is no longer in the project folder\)$/, '$1 gerado a partir de $2 (o seu ficheiro HDL $3 já não está na pasta do projeto)'],
  [/^(\S+) generated from (\S+) \((\S+) holds something else\)$/, '$1 gerado a partir de $2 ($3 contém outra coisa)'],
  [/^(\S+) replaced by the HDL generated from (\S+), linked to it$/, '$1 substituído pelo HDL gerado a partir de $2, ligado a ele'],
  [/^(\S+) generated again from (\S+), back in the project$/, '$1 gerado de novo a partir de $2, de volta ao projeto'],
  [/^(\S+): its module made$/, '$1: o seu módulo gerado'],
  [/^(\S+) updated from (\S+)$/, '$1 atualizado a partir de $2'],
  // (a drawing's HDL file checked against it, #5872: core/drawing-sync.js)
  [/^(\S+) updated from (\S+) \(the drawing was changed outside Silinx\)$/, '$1 atualizado a partir de $2 (o desenho foi alterado fora do Silinx)'],
  [/^(\S+) updated from (\S+) \(its text before, from a file with no silinx-sync line, is kept in version (\S+)\)$/, '$1 atualizado a partir de $2 (o seu texto anterior, de um ficheiro sem linha silinx-sync, fica guardado na versão $3)'],
  [/^(\S+) updated from (\S+) \(its text before could not be kept in a version: (.+)\)$/, '$1 atualizado a partir de $2 (o seu texto anterior não pôde ser guardado numa versão: $3)'],
  [/^(\S+) was changed outside Silinx: made again from (\S+), the drawing being its source; the changed file is kept in version (\S+) \("(.+)"\)\.$/,
    '$1 foi alterado fora do Silinx: gerado de novo a partir de $2, o desenho sendo a sua fonte; o ficheiro alterado fica guardado na versão $3 ("$4").'],
  [/^(\S+) was changed outside Silinx: made again from (\S+), the drawing being its source; the changed file could not be kept in a version: (.+)\.$/,
    '$1 foi alterado fora do Silinx: gerado de novo a partir de $2, o desenho sendo a sua fonte; o ficheiro alterado não pôde ser guardado numa versão: $3.'],
  [/^(\S+): its module was changed outside Silinx: made again from the drawing; the changed file is kept in version (\S+) \("(.+)"\)\.$/,
    '$1: o seu módulo foi alterado fora do Silinx: gerado de novo a partir do desenho; o ficheiro alterado fica guardado na versão $2 ("$3").'],
  [/^(\S+): its module was changed outside Silinx: made again from the drawing; the changed file could not be kept in a version: (.+)\.$/,
    '$1: o seu módulo foi alterado fora do Silinx: gerado de novo a partir do desenho; o ficheiro alterado não pôde ser guardado numa versão: $2.'],
  [/^the drawings' HDL files not checked: (.+)$/, 'os ficheiros HDL dos desenhos não foram verificados: $1'],
  // Remove from Project (web/js/design.js)
  [/^Removed (\S+) and its HDL file (\S+) from the project \(the files are kept in the project folder\)\.$/, 'Removidos do projeto $1 e o seu ficheiro HDL $2 (os ficheiros ficam na pasta do projeto).'],
  [/^Removed (.+) from the project \(the file is kept in the project folder\)\.$/, 'Removido $1 do projeto (o ficheiro fica na pasta do projeto).'],
  // (the files deleted too, #5720: core/project-entries.js removedMessage)
  [/^Removed (\S+) and its HDL file (\S+) from the project and deleted them( \(moved to the workspace's \.trash folder\))?\.$/, (m, a, b, tr) => `Removidos do projeto ${a} e o seu ficheiro HDL ${b}, e apagados${tr ? ' (movidos para a pasta .trash da área de trabalho)' : ''}.`],
  [/^Removed (.+) from the project and deleted it( \(moved to the workspace's \.trash folder\))?\.$/, (m, a, tr) => `Removido ${a} do projeto, e apagado${tr ? ' (movido para a pasta .trash da área de trabalho)' : ''}.`],
  // Open Project's Delete (#5785, web/js/open-project-delete.js, core/project-delete.js): the question, the console's lines
  [/^Delete (?:the project '(.+)'|these (\d+) projects)\?\n((?:'.+'\n)*)\n(Its folder is|Their folders are|It is|They are) (?:moved to the workspace's \.trash folder|deleted from this browser's storage)\.(?:\n'(.+)' is open: it is closed first\.)?\nThis cannot be undone\.$/,
    (m, one, n, list, who, open) => `${one ? `Apagar o projeto '${one}'?` : `Apagar estes ${n} projetos?`}\n${list}\n${{ 'Its folder is': 'A sua pasta é movida', 'Their folders are': 'As suas pastas são movidas', 'It is': 'É apagado', 'They are': 'São apagados' }[who]}${/folder/.test(who) ? ' para a pasta .trash da área de trabalho' : ' do armazenamento deste navegador'}.${open ? `\n'${open}' está aberto: é fechado primeiro.` : ''}\nNão se pode anular.`],
  [/^Project '(.+)' deleted( \(moved to the workspace's \.trash folder\))?\.$/, (m, p, tr) => `Projeto '${p}' apagado${tr ? ' (movido para a pasta .trash da área de trabalho)' : ''}.`],
  [/^Project '(.+)' closed, to be deleted\.$/, "Projeto '$1' fechado, para ser apagado."],
  [/^'(.+)' is not deleted while a process of it runs: stop it \(or wait for it to finish\) first\.$/, "'$1' não é apagado enquanto um processo dele corre: pare-o (ou espere que termine) primeiro."],
  [/^'(.+)' is not deleted while it is shared live: stop sharing it first\.$/, "'$1' não é apagado enquanto é partilhado em direto: pare de o partilhar primeiro."],
  [/^'(.+)' is another person's project, followed live: it is not deleted\.$/, "'$1' é o projeto de outra pessoa, seguido em direto: não é apagado."],
  // Edit ▸ Undo / Redo of a project's command (web/js/app.js): the command's name
  // (in a project shared live with editors, #5739: a command's change and a later one in the same places)
  [/^(Undo|Redo): (.+?): not (?:undone|redone): (.+) changed since in the same places; the project kept as it is\.$/, (m, w, a, p) => `${w === 'Undo' ? 'Anular' : 'Refazer'}: ${t(a)}: não ${w === 'Undo' ? 'anulado' : 'refeito'}: ${p} alterado desde então nos mesmos sítios; o projeto mantido como está.`],
  [/^(Undo|Redo): (.+)\.$/, (m, w, a) => `${w === 'Undo' ? 'Anular' : 'Refazer'}: ${t(a)}.`],
  // Rename… (web/js/rename.js, core/rename-module.js)
  [/^Rename: (.+)\.$/, (m, parts) => `Mudar o Nome: ${parts.split('; ').map(renamed).join('; ')}.`],
  // Duplicate… (#5862): the copy, its modules, the files with it; its refusals
  [/^Duplicate: (.+)\.$/, (m, p) => `Duplicar: ${p.replace(/module '(.+?)' copied as '(.+?)'/g, "módulo '$1' copiado como '$2'").replace(/ \((.+) with it\)$/, ' (com $1)')}.`],
  [/^(\S+) is written by Silinx itself: it is not duplicated\.$/, '$1 é escrito pelo próprio Silinx: não é duplicado.'],
  [/^(\S+) is not a text file: it is not duplicated\.$/, '$1 não é um ficheiro de texto: não é duplicado.'],
  [/^(\S+) cannot be read: it is not duplicated\.$/, '$1 não pode ser lido: não é duplicado.'],
  [/^no file '(.+)' in the project$/, "nenhum ficheiro '$1' no projeto"],
  [/^(\S+) declares the package '(.+)': a copy would declare it twice\.$/, "$1 declara o pacote '$2': uma cópia declará-lo-ia duas vezes."],
  [/^(\S+) declares (several modules|no module): only its file's name is chosen\.$/, (m, f, w) => `${f} declara ${w === 'no module' ? 'nenhum módulo' : 'vários módulos'}: só se escolhe o nome do seu ficheiro.`],
  [/^The copy keeps the file's kind: its name ends in (\S+)\.$/, 'A cópia mantém o tipo do ficheiro: o seu nome termina em $1.'],
  [/^no free name for a copy of (\S+)$/, 'nenhum nome livre para uma cópia de $1'],
  // Export Project (web/js/menus.js)
  [/^Exported (\S+): the whole Silinx project \(silinx\.json \+ all project files, (\d+) KB\)\.$/, 'Exportado $1: o projeto Silinx inteiro (silinx.json + todos os ficheiros do projeto, $2 KB).'],
  [/^Exported (\S+): Xilinx ISE project (\S+) \+ its sources \((\d+) KB\)\.$/, 'Exportado $1: o projeto Xilinx ISE $2 + as suas fontes ($3 KB).'],
  // Import Project (web/js/project-zip-dialogs.js): its counts as they are written
  [/^Imported (Silinx|Xilinx ISE) project '(.+)' \((.+)\)\.$/, (m, k, p, n) => `Importado o projeto ${k} '${p}' (${counts(n)}).`],
  [/^Importing folder '(.+)': (.+)\.$/, (m, f, n) => `A importar a pasta '${f}': ${counts(n.replace(/(\d+) (?:build|ISE output)\/hidden file\(s\) skipped/, '$1 ficheiro(s) gerado(s)/oculto(s) ignorado(s)'))}.`],
  [/^files listed in silinx\.json but not in the (folder|zip): (.+)$/, (m, w, f) => `ficheiros listados em silinx.json mas não ${w === 'zip' ? 'no zip' : 'na pasta'}: ${f}`],
  [/^files referenced by the \.xise but not found: (.+)$/, 'ficheiros referidos pelo .xise mas não encontrados: $1'],
  // the wizards' sources (web/js/clock-wizard.js, bram-wizard.js, modwizard.js, chart-wizards.js, tt-wizard.js,
  // petri-wizard.js, circuit-wizard.js, ucf-wizard.js) and Save as Test Bench (web/js/viewers.js)
  [/^Clocking Wizard: (created|wrote again) (\S+), the module (\S+): (.+)\.$/, (m, w, p, n, o) => `Assistente de Relógio: ${w === 'created' ? 'criou' : 'reescreveu'} ${p}, o módulo ${n}: ${o}.`],
  [/^Block Memory: (created|wrote again) (\S+), the module (\S+): (\d+) x (\d+), (.+)\.$/, (m, w, p, n, d, b, s) => `Memória de Bloco: ${w === 'created' ? 'criou' : 'reescreveu'} ${p}, o módulo ${n}: ${d} x ${b}, ${s === 'inferable HDL' ? 'HDL inferível' : s}.`],
  [/^Module Wizard: created (\S+) \((VHDL|Verilog), (sequential|combinational)\)\. Fill in the TODO comments with the logic\.$/,
    (m, p, l, k) => `Assistente de Módulo: criou ${p} (${l}, ${k === 'sequential' ? 'sequencial' : 'combinatório'}). Preencha os comentários TODO com a lógica.`],
  [/^Schematic Wizard: created (\S+) with (\d+) I\/O marker\(s\)\.$/, 'Assistente de Esquemático: criou $1 com $2 marcador(es) de E/S.'],
  [/^(.+ Wizard): created (\S+) with (\d+) input\(s\), (\d+) output\(s\) and (\d+) state\(s\)\.$/, (m, w, p, i, o, s) => `${t(w)}: criou ${p} com ${i} entrada(s), ${o} saída(s) e ${s} estado(s).`],
  [/^(.+ Wizard): created (\S+) with (\d+) input\(s\) and (\d+) output\(s\)\.$/, (m, w, p, i, o) => `${t(w)}: criou ${p} com ${i} entrada(s) e ${o} saída(s).`],
  [/^Digital Electronic Circuit Wizard: created (\S+) \((.+), (\d+) part\(s\), (\d+) wire\(s\)\)\.$/, (m, p, a, n, w) => `Assistente de Circuito Eletrónico Digital: criou ${p} (${t(a)}, ${n} peça(s), ${w} fio(s)).`],
  [/^(\S+ Wizard): created (\S+) for '(.+)', (\d+) net\(s\) on pins\.$/, (m, w, p, top, n) => `${t(w)}: criou ${p} para '${top}', ${n} rede(s) em pinos.`],
  [/^Save as Test Bench: created (?:the test bench (\S+)|(\S+)) from the stimuli of '(.+)' \((\d+) cycle\(s\)\); run Simulate Behavioral Model on (\S+) to check the design\.$/,
    (m, name, p, mod, n, tb) => `Guardar como Bancada de Teste: criou ${name ? `a bancada de teste ${name}` : p} a partir dos estímulos de '${mod}' (${n} ciclo(s)); execute Simular Modelo Comportamental em ${tb} para verificar o projeto.`],
];
