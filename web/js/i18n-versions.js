// Portuguese of a project's versions (#5740, web/js/versions.js): Project ▸ Save Version… and Versions…, what made each
// version, and the console's lines of a version saved or restored; merged into the dictionary of i18n.js.
import { t } from './i18n.js';
export const VERSIONS_PT = {
  'Save Version…': 'Guardar Versão…', 'Save Version': 'Guardar Versão', 'Versions…': 'Versões…', 'Restore Project': 'Restaurar Projeto',
  // (a version's files against now, #5741)
  'Restore': 'Restaurar', 'changed since': 'alterado desde então',
  'added in it': 'acrescentado nela', 'changed in it': 'alterado nela', 'removed in it': 'removido nela', 'added since': 'acrescentado desde então', 'removed since': 'removido desde então',
  'Version name (optional):': 'Nome da versão (opcional):', 'Restore Version': 'Restaurar Versão', 'Versions': 'Versões', 'Time': 'Hora', 'Made': 'Feita',
  'No versions of this project yet: Save Version… keeps one, and one is kept as you work.': 'Ainda não há versões deste projeto: Guardar Versão… guarda uma, e é guardada uma à medida que trabalha.',
  // (what made a version: core/versions.js REASONS)
  'saved on its own': 'guardada automaticamente', 'saved by hand': 'guardada à mão', 'before Merge Contribution': 'antes de Juntar Contribuição',
  'before Remove from Project': 'antes de Remover do Projeto', 'before Delete': 'antes de Apagar', 'before a conversion': 'antes de uma conversão',
  'before an import': 'antes de uma importação', 'before a git pull or merge': 'antes de um pull ou merge do git', 'before Change Mode': 'antes de Mudar o Modo', 'before a document\'s new format': 'antes do novo formato de um documento', 'before a restore': 'antes de um restauro',
};

export const VERSIONS_PT_PATTERNS = [
  [/^Versions of (.+)$/, 'Versões de $1'],
  [/^restored version (\d+)$/, 'versão $1 restaurada'],
  [/^Version (\d+) against now:$/, 'A versão $1 comparada com agora:'],
  // (a project followed, #5742)
  [/^Version (\d+) changed \(its files are opened and compared in (.+)'s Silinx\):$/, 'A versão $1 alterou (os seus ficheiros abrem-se e comparam-se no Silinx de $2):'],
  [/^(.+)'s Silinx did not answer$/, 'o Silinx de $1 não respondeu'],
  [/^a version's files are opened and compared in (.+)'s Silinx, which keeps the versions$/, 'os ficheiros de uma versão abrem-se e comparam-se no Silinx de $1, que guarda as versões'],
  [/^The project is as version (\d+) has it\.$/, 'O projeto está como a versão $1 o tem.'],
  [/^Read-only, as it was in version (\d+)$/, 'Só de leitura, como estava na versão $1'],
  [/^as it was in version (\d+)$/, 'como estava na versão $1'],
  [/^(.+), as it was in version (\d+)$/, '$1, como estava na versão $2'],
  [/^Version (\d+) of (.+) saved(?:: (.+))?\.$/, (m, n, p, l) => `Versão ${n} de ${p} guardada${l ? `: ${l}` : ''}.`],
  [/^Version (\d+) of (.+) has it already: no version saved\.$/, 'A versão $1 de $2 já o tem: nenhuma versão guardada.'],
  [/^Restored (.+) as version (\d+) had it: (\d+) file\(s\) written, (\d+) removed; the project before it kept as version (\d+) \(restore it to undo\)\.$/,
    'Restaurado $1 como a versão $2 o tinha: $3 ficheiro(s) escrito(s), $4 removido(s); o projeto antes disso guardado como versão $5 (restaure-a para anular).'],
  [/^(.+) is as version (\d+) has it already: nothing restored\.$/, '$1 já está como a versão $2 o tem: nada restaurado.'],
  // (an error's own message: the server's or the browser's, in English)
  [/^(Save Version|Restore Version|Versions): ([\s\S]+)$/, (m, w, e) => `${t(w)}: ${e}`],
  [/^(.+): no version of the project kept before it: ([\s\S]+)\.$/, (m, c, e) => `${t(c)}: nenhuma versão do projeto guardada antes: ${e}.`],
];
