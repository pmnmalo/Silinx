// Portuguese strings of Merge Contribution… (#4206, web/js/merge-dialog.js): Project ▸ Merge Contribution… and Undo
// Merge, their windows; and of the merge view of text files (#4214, web/js/merge-view.js); merged into the dictionary
// of i18n.js.
export const MERGE_PT = {
  'Merge Contribution…': 'Juntar Contribuição…', 'Merge Contribution': 'Juntar Contribuição', 'Undo Merge': 'Desfazer Junção',
  'Merge': 'Juntar', 'Contribution folder:': 'Pasta da contribuição:', 'This project': 'Este projeto',
  'Merge another person\'s copy of this project into it: its folder, or a .zip of it (File ▸ Export Project (.zip)…, Silinx). What only one side changed is taken; for what both changed, you choose.':
    'Junte a este projeto a cópia de outra pessoa: a sua pasta, ou um .zip dela (Ficheiro ▸ Exportar Projeto (.zip)…, Silinx). O que só um dos lados alterou é aceite; o que ambos alteraram, escolhe você.',
  'Changed there: taken': 'Alterado lá: aceite', 'Added there: taken': 'Acrescentado lá: aceite', 'Removed there: removed': 'Removido lá: removido',
  'Changed here: kept': 'Alterado cá: mantido', 'Changed on both sides: merged by its objects': 'Alterado dos dois lados: juntado pelos seus objetos',
  'Made again from its drawing': 'Gerado de novo a partir do seu desenho', 'Changed on both sides: choose': 'Alterado dos dois lados: escolha',
  // the merge view (#4214)
  'Previous Conflict': 'Conflito Anterior', 'Next Conflict': 'Conflito Seguinte', 'The conflict before this one': 'O conflito antes deste',
  'The next conflict': 'O conflito seguinte', 'Apply the merge with these choices': 'Aplicar a junção com estas escolhas',
  'Close the merge view: nothing is merged': 'Fechar a vista de junção: nada é juntado', 'The file shown': 'O ficheiro mostrado',
  'Common Ancestor': 'Antepassado Comum', 'Result': 'Resultado', 'Both': 'Ambos', 'Edited': 'Editado',
  'Choose Mine, Theirs or Both, or write the lines here.': 'Escolha O meu, O deles ou Ambos, ou escreva aqui as linhas.',
  'Mine (here)': 'O meu (cá)', 'Theirs (GitHub)': 'O deles (GitHub)',
};
// the actions a merge view ends with, as their buttons say them
const ACTIONS_PT = { 'Pull from GitHub': 'Receber do GitHub (Pull)', 'Merge': 'Juntar', 'Merge Branch': 'Juntar Ramo' };
export const MERGE_PT_PATTERNS = [
  [/^Through their common ancestor: (\d+) file\(s\) differ, (\d+) conflict\(s\) to choose\.$/, 'Através do antepassado comum: $1 ficheiro(s) diferem, $2 conflito(s) a escolher.'],
  [/^With no common ancestor: each file that differs is a choice \((\d+)\)\.$/, 'Sem antepassado comum: cada ficheiro que difere é uma escolha ($1).'],
  [/^Choose Mine or Theirs for (\d+) conflict\(s\) more\.$/, 'Escolha O meu ou O deles para mais $1 conflito(s).'],
  [/^Read-only, This project$/, 'Só de leitura, Este projeto'],
  [/^Read-only, the folder '(.+)'$/, 'Só de leitura, a pasta \'$1\''],
  [/^Read-only, (.+\.zip)$/i, 'Só de leitura, $1'],
  // the merge view (#4214)
  [/^Conflict (\d+) of (\d+)$/, 'Conflito $1 de $2'],
  [/^⋯ (\d+) unchanged line\(s\)$/, '⋯ $1 linha(s) sem alteração'],
  [/^File (\d+) of (\d+)$/, 'Ficheiro $1 de $2'],
  [/^(\d+) of (\d+) conflict\(s\) resolved$/, '$1 de $2 conflito(s) resolvido(s)'],
  [/^Merge: (\d+) conflict\(s\) in (\d+) file\(s\), the same lines changed on both sides: choose Mine, Theirs or Both for each, or edit its lines, then (.+)\.$/,
    (m, n, f, a) => `Junção: ${n} conflito(s) em ${f} ficheiro(s), as mesmas linhas alteradas dos dois lados: escolha O meu, O deles ou Ambos para cada um, ou edite as suas linhas, e depois ${ACTIONS_PT[a] || a}.`],
  [/^Merge: (\d+) conflict\(s\) left to resolve \((.+)\): choose Mine, Theirs or Both, or edit its lines\.$/,
    'Junção: $1 conflito(s) por resolver ($2): escolha O meu, O deles ou Ambos, ou edite as suas linhas.'],
];
