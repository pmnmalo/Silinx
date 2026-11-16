// Portuguese strings of Merge Contribution… (#4206, web/js/merge-dialog.js): Project ▸ Merge Contribution… and Undo
// Merge, their windows; merged into the dictionary of i18n.js.
export const MERGE_PT = {
  'Merge Contribution…': 'Juntar Contribuição…', 'Merge Contribution': 'Juntar Contribuição', 'Undo Merge': 'Desfazer Junção',
  'Merge': 'Juntar', 'Contribution folder:': 'Pasta da contribuição:', 'This project': 'Este projeto',
  'Merge another person\'s copy of this project into it: its folder, or a .zip of it (File ▸ Export Project (.zip)…, Silinx). What only one side changed is taken; for what both changed, you choose.':
    'Junte a este projeto a cópia de outra pessoa: a sua pasta, ou um .zip dela (Ficheiro ▸ Exportar Projeto (.zip)…, Silinx). O que só um dos lados alterou é aceite; o que ambos alteraram, escolhe você.',
  'Changed there: taken': 'Alterado lá: aceite', 'Added there: taken': 'Acrescentado lá: aceite', 'Removed there: removed': 'Removido lá: removido',
  'Changed here: kept': 'Alterado cá: mantido', 'Changed on both sides: merged by its objects': 'Alterado dos dois lados: juntado pelos seus objetos',
  'Made again from its drawing': 'Gerado de novo a partir do seu desenho', 'Changed on both sides: choose': 'Alterado dos dois lados: escolha',
};
export const MERGE_PT_PATTERNS = [
  [/^Through their common ancestor: (\d+) file\(s\) differ, (\d+) conflict\(s\) to choose\.$/, 'Através do antepassado comum: $1 ficheiro(s) diferem, $2 conflito(s) a escolher.'],
  [/^With no common ancestor: each file that differs is a choice \((\d+)\)\.$/, 'Sem antepassado comum: cada ficheiro que difere é uma escolha ($1).'],
  [/^Choose Mine or Theirs for (\d+) conflict\(s\) more\.$/, 'Escolha O meu ou O deles para mais $1 conflito(s).'],
  [/^Read-only, This project$/, 'Só de leitura, Este projeto'],
  [/^Read-only, the folder '(.+)'$/, 'Só de leitura, a pasta \'$1\''],
  [/^Read-only, (.+\.zip)$/i, 'Só de leitura, $1'],
];
