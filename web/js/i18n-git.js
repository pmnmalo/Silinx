// Portuguese strings of git (#3195, web/js/git.js): File ▸ Open from GitHub Repository…, File ▸ Git ▸, their dialogs and the
// Design pane's marks; merged into the dictionary of i18n.js.
export const GIT_PT = {
  'Open from GitHub Repository…': 'Abrir do Repositório GitHub…', 'Open from GitHub Repository': 'Abrir do Repositório GitHub',
  'Git': 'Git (controlo de versões)',
  'Commit…': 'Registar (Commit)…', 'Commit': 'Registar (Commit)', 'Push to GitHub': 'Enviar para o GitHub (Push)', 'Pull from GitHub': 'Receber do GitHub (Pull)',
  'Store Project in a GitHub Repository…': 'Guardar o Projeto num Repositório GitHub…', 'Store Project in a GitHub Repository': 'Guardar o Projeto num Repositório GitHub', 'Initialize': 'Inicializar',
  'GitHub repository (a Classroom assignment\'s too):': 'Repositório do GitHub (também o de um trabalho do Classroom):',
  'GitHub repository (optional: where Push sends the commits):': 'Repositório do GitHub (opcional: para onde o Push envia os commits):',
  'Message:': 'Mensagem:', 'https://github.com/owner/repository': 'https://github.com/dono/repositório',
  'No change since the last commit.': 'Nenhuma alteração desde o último commit.',
  'Say in a few words what changed.': 'Diga em poucas palavras o que mudou.',
  'git signs in to GitHub with its own credentials (GitHub\'s command line, Git Credential Manager or an SSH key): Silinx never asks for a password or a token.':
    'O git autentica-se no GitHub com as suas próprias credenciais (a linha de comandos do GitHub, o Git Credential Manager ou uma chave SSH): o Silinx nunca pede uma palavra-passe nem um token.',
  'A .gitignore leaves build/ and the tools\' outputs out of the commits.': 'Um .gitignore deixa build/ e os resultados das ferramentas fora dos commits.',
  'In conflict': 'Em conflito', 'New: not committed yet': 'Novo: ainda sem commit', 'Changed since the last commit': 'Alterado desde o último commit',
  'Committed': 'Registado', 'History…': 'Histórico…', 'History': 'Histórico', 'No commit yet.': 'Ainda sem commits.',
  'GitHub Checks': 'Verificações do GitHub (Checks)',   // (#3194)
  // the browser edition (#3196: GitHub's API, its own sign-in)
  'Commit and Push…': 'Registar e Enviar (Commit e Push)…', 'Commit and Push': 'Registar e Enviar (Commit e Push)',
  'Sign in with GitHub…': 'Iniciar sessão no GitHub…', 'Sign in with GitHub': 'Iniciar sessão no GitHub', 'Sign out of GitHub': 'Terminar sessão no GitHub',
  'Open this page of GitHub, sign in there and enter the code:': 'Abra esta página do GitHub, inicie lá a sessão e introduza o código:',
  'Asking GitHub for a code…': 'A pedir um código ao GitHub…',
  'Waiting for GitHub: enter the code there and authorize Silinx.': 'À espera do GitHub: introduza lá o código e autorize o Silinx.',
  'A public repository opens as it is; a private one (a Classroom assignment\'s) after Sign in with GitHub… with your private repositories included.':
    'Um repositório público abre-se tal como está; um privado (o de um trabalho do Classroom) depois de Iniciar sessão no GitHub… com os seus repositórios privados incluídos.',
  // (#3356: the scope asked for, where the sign-in is kept)
  'The sign-in is sent only to GitHub, and kept in this browser unless you untick Remember me (then in this tab until it is closed).':
    'A sessão é enviada só ao GitHub, e fica guardada neste navegador a menos que desmarque Lembrar-me (então neste separador até ser fechado).',
  'Remember me in this browser (kept after this tab closes, where every page of this site\'s address can read it)':
    'Lembrar-me neste navegador (guardada depois de fechar este separador, onde todas as páginas do endereço deste sítio a podem ler)',
  // (#3530: the single file opened from the disk keeps the sign-in in its tab only)
  'The sign-in is sent only to GitHub, and kept in this tab until it is closed (a Silinx opened from a file does not remember it).':
    'A sessão é enviada só ao GitHub, e fica guardada neste separador até ser fechado (um Silinx aberto de um ficheiro não a lembra).',
  'A Silinx opened from a file keeps the sign-in in this tab only: every page opened from the disk can read what this browser keeps for files.':
    'Um Silinx aberto de um ficheiro guarda a sessão só neste separador: todas as páginas abertas do disco podem ler o que este navegador guarda para ficheiros.',
  'Silinx asks GitHub for your public repositories and your gists.': 'O Silinx pede ao GitHub os seus repositórios públicos e os seus gists.',
  'Include my private repositories (a Classroom assignment\'s): GitHub then gives Silinx all of them':
    'Incluir os meus repositórios privados (o de um trabalho do Classroom): o GitHub dá então ao Silinx todos eles',
  'Get a Code': 'Obter um Código',
  'GitHub repository (an empty one: where the commits go):': 'Repositório do GitHub (um vazio: para onde vão os commits):',
  // the drawings' diffs and conflicts (#3197)
  'Compare': 'Comparar', 'Resolve Conflicts': 'Resolver Conflitos', 'Mine': 'O meu', 'Theirs': 'O deles',
  'Not there yet.': 'Ainda não existia.', 'Deleted.': 'Apagado.', 'Read-only': 'Só de leitura',
  'as it is now': 'como está agora', 'before the first commit': 'antes do primeiro commit',
  // the sign-in with a token (#3196)
  'Sign in with a fine-grained personal access token of your GitHub account:': 'Inicie sessão com um token de acesso pessoal de granularidade fina da sua conta do GitHub:',
  'Open GitHub\'s page for a new token:': 'Abra a página do GitHub para um novo token:',
  'Repository access: Only select repositories (the ones to open in Silinx).': 'Acesso aos repositórios: Only select repositories (os que vai abrir no Silinx).',
  'Repository permissions: Contents, Read and write (Metadata, Read-only, comes with it).': 'Permissões dos repositórios: Contents, Read and write (Metadata, Read-only, vem com ela).',
  'Repository permissions: Actions and Commit statuses, Read-only (for GitHub Checks).': 'Permissões dos repositórios: Actions e Commit statuses, Read-only (para as Verificações do GitHub).',
  'Generate the token, copy it and paste it here.': 'Gere o token, copie-o e cole-o aqui.',
  'Account permissions: Gists, Read and write (for Share Project\'s short links).': 'Permissões da conta: Gists, Read and write (para as ligações curtas de Partilhar Projeto).',
  'Sign In': 'Iniciar Sessão',
  // Sign out of GitHub asks first (#4256)
  'Sign Out': 'Terminar Sessão',
  'Silinx forgets the personal access token in this browser. Signing in again needs that token (keep a copy of it) or a new one.':
    'O Silinx esquece o token de acesso pessoal neste navegador. Para voltar a iniciar sessão é preciso esse token (guarde uma cópia dele) ou um novo.',
  'The token stays valid on GitHub until it is deleted there:': 'O token continua válido no GitHub até ser apagado lá:',
  'Silinx forgets the sign-in in this browser. You can sign in again at any time with Sign in with GitHub…':
    'O Silinx esquece a sessão neste navegador. Pode voltar a iniciar sessão a qualquer momento com Iniciar sessão no GitHub…',
  'Silinx\'s authorization stays on GitHub until it is revoked under Settings ▸ Applications:':
    'A autorização do Silinx continua no GitHub até ser revogada em Settings ▸ Applications:',
  // the Collaboration tab (#4215, web/js/collab-tab.js)
  'Collaboration': 'Colaboração', 'Repository': 'Repositório', 'Git Repository': 'Repositório Git', 'Changes': 'Alterações', 'Changes…': 'Alterações…', 'Branch:': 'Ramo:',
  'No project open.': 'Nenhum projeto aberto.', 'The project is not in a git repository.': 'O projeto não está num repositório git.',
  'No GitHub repository (origin).': 'Sem repositório do GitHub (origin).', 'Not pushed yet': 'Ainda não enviado (Push)',
  'Compare with the last commit': 'Comparar com o último commit', 'Deleted since the last commit': 'Apagado desde o último commit',
  'git signs in to GitHub with its own credentials.': 'O git autentica-se no GitHub com as suas próprias credenciais.',
  'Checks passed': 'Verificações aprovadas', 'Checks failed': 'Verificações falhadas', 'Checks running': 'Verificações a decorrer',
  'No check on GitHub': 'Nenhuma verificação no GitHub',
  'Share a Copy…': 'Partilhar uma Cópia…', 'Not shared live.': 'Não partilhado em direto.', 'Share Live…': 'Partilhar em Direto…',
  'To follow a project shared live, open its link.': 'Para seguir um projeto partilhado em direto, abra a sua ligação.',
  // the branches (#4213, web/js/git-branch.js)
  'New Branch…': 'Novo Ramo…', 'Switch Branch…': 'Mudar de Ramo…', 'Merge Branch…': 'Juntar Ramo…',
  'New Branch': 'Novo Ramo', 'Switch Branch': 'Mudar de Ramo', 'Merge Branch': 'Juntar Ramo', 'Merge Branch (merge)': 'Juntar Ramo (junção)',
  'Create': 'Criar', 'Switch': 'Mudar', 'Name of the new branch:': 'Nome do novo ramo:', 'Branch of the project:': 'Ramo do projeto:',
  'Switch to:': 'Mudar para:', 'Merge in:': 'Juntar este:', '(no branch)': '(sem ramo)',
  'Each person of a group works on a branch of their own, made from the last commit: the project goes on it, its changes kept.':
    'Cada pessoa de um grupo trabalha num ramo seu, feito a partir do último commit: o projeto passa para ele, com as suas alterações.',
  'The project\'s files become the branch\'s last commit\'s. Commit your changes first.':
    'Os ficheiros do projeto passam a ser os do último commit do ramo. Registe (commit) primeiro as suas alterações.',
  'What only the other branch changed is taken; a drawing changed on both is merged by its objects, a file by its lines; for the same objects or lines, you choose. Commit your changes first.':
    'O que só o outro ramo alterou é aceite; um desenho alterado nos dois junta-se pelos seus objetos, um ficheiro pelas suas linhas; para os mesmos objetos ou linhas, escolhe você. Registe (commit) primeiro as suas alterações.',
  'The project has no other branch: New Branch… makes one.': 'O projeto não tem outro ramo: Novo Ramo… cria um.',
};

export const GIT_PT_PATTERNS = [
  [/^(\d+) commit\(s\), the newest first: a file opens as it was then, read only\.$/, '$1 commit(s), o mais recente primeiro: um ficheiro abre-se como era então, só de leitura.'],
  [/^Read-only, as it was in the commit ([0-9a-f]{7})( \(.+\))?$/, 'Só de leitura, como era no commit $1$2'],
  [/^Read-only, as it is now$/, 'Só de leitura, como está agora'], [/^Read-only, before the first commit$/, 'Só de leitura, antes do primeiro commit'],
  [/^(\d+) added$/, '$1 acrescentado(s)'], [/^(\d+) removed$/, '$1 removido(s)'], [/^(\d+) moved or changed$/, '$1 movido(s) ou alterado(s)'],
  [/^(\d+) line\(s\) changed$/, '$1 linha(s) alterada(s)'],
  [/^(\d+) object\(s\) changed both here and on GitHub: choose whose version each one keeps\. The rest of each drawing is merged by itself\.$/, '$1 objeto(s) alterado(s) aqui e no GitHub: escolha a versão que cada um mantém. O resto de cada desenho junta-se por si.'],
  [/^Choose Mine or Theirs for (\d+) object\(s\) more\.$/, 'Escolha O meu ou O deles para mais $1 objeto(s).'],
  [/^(\d+) change\(s\) on (.+):$/, '$1 alteração(ões) em $2:'],
  // Changes… (#4581, web/js/git-changes.js) and the conflicts' count of the Collaboration tab
  [/^(\d+) change\(s\) on (.+): a click compares a file with the last commit\.$/, '$1 alteração(ões) em $2: um clique compara um ficheiro com o último commit.'],
  [/^(\d+) file\(s\) in conflict: resolve each, then commit\.$/, '$1 ficheiro(s) em conflito: resolva cada um e depois registe (commit).'],
  [/^(\d+) file\(s\) in conflict$/, '$1 ficheiro(s) em conflito'],
  [/^\((changed|new|deleted|in conflict)\)$/, (_, w) => `(${{ changed: 'alterado', new: 'novo', deleted: 'apagado', 'in conflict': 'em conflito' }[w]})`],
  [/^(\d+) commit\(s\) to push$/, '$1 commit(s) por enviar (Push)'], [/^(\d+) commit\(s\) to pull$/, '$1 commit(s) por receber (Pull)'],   // (#4215)
  // (#4213) Merge Branch…'s merge view and conflicts
  [/^Mine \((.+)\)$/, 'O meu ($1)'], [/^Theirs \((.+)\)$/, 'O deles ($1)'],
  [/^(\d+) object\(s\) changed on both branches: choose whose version each one keeps\. The rest of each drawing is merged by itself\.$/, '$1 objeto(s) alterado(s) nos dois ramos: escolha a versão que cada um mantém. O resto de cada desenho junta-se por si.'],
  [/^not a GitHub repository's address: (.*)$/, 'não é o endereço de um repositório do GitHub: $1'],
  [/^a GitHub Classroom invitation, not a repository$/, 'um convite do GitHub Classroom, não um repositório'],
];
