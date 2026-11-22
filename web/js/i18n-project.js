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
};

export const PROJECT_PT_PATTERNS = [
  // a project opened (web/js/project.js)
  [/^Project "(.+)" opened \(a design and simulation project, no FPGA\)\.$/, 'Projeto "$1" aberto (um projeto de desenho e simulação, sem FPGA).'],
  [/^Project "(.+)" opened \((\S+)\)\.$/, 'Projeto "$1" aberto ($2).'],
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
  // Remove from Project (web/js/design.js)
  [/^Removed (\S+) and its HDL file (\S+) from the project \(the files are kept in the project folder\)\.$/, 'Removidos do projeto $1 e o seu ficheiro HDL $2 (os ficheiros ficam na pasta do projeto).'],
  [/^Removed (.+) from the project \(the file is kept in the project folder\)\.$/, 'Removido $1 do projeto (o ficheiro fica na pasta do projeto).'],
  // Edit ▸ Undo / Redo of a project's command (web/js/app.js): the command's name
  [/^(Undo|Redo): (.+)\.$/, (m, w, a) => `${w === 'Undo' ? 'Anular' : 'Refazer'}: ${t(a)}.`],
  // Rename… (web/js/rename.js, core/rename-module.js)
  [/^Rename: (.+)\.$/, (m, parts) => `Mudar o Nome: ${parts.split('; ').map(renamed).join('; ')}.`],
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
