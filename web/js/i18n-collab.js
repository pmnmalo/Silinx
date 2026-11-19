// Portuguese strings of a shared project (#3181): Share Project…'s live sharing (web/js/collab-share.js), following one
// (web/js/collab-follow.js), who is in it (web/js/collab-presence.js), the follower's notice (web/js/collab-state.js),
// a room the owner's page hosts (web/js/collab-host.js) and its meeting point (web/js/collab-meet.js);
// merged into the dictionary of i18n.js. (The console's lines are not translated, as every tool's output.)
export const COLLAB_PT = {
  'Share': 'Partilhar',
  'Follow a Shared Project': 'Seguir um Projeto Partilhado', 'Follow': 'Seguir',
  // (a shared project's link given to a running Silinx with changes not saved yet, web/js/link-hash.js, #3531)
  'This link follows a project someone shares. Your open documents have changes not saved yet: save them, then follow it?':
    'Esta ligação segue um projeto que alguém partilha. Os seus documentos abertos têm alterações ainda não guardadas: guardá-las e depois segui-lo?',
  'Save and Follow': 'Guardar e Seguir',
  'Stop Sharing': 'Parar de Partilhar', 'Stop Following': 'Deixar de Seguir', 'Sharing': 'A partilhar',
  // (following ended, #4198: web/js/collab-leave.js)
  'Keep a Copy': 'Guardar uma Cópia', 'Close Without Keeping': 'Fechar sem Guardar',
  'You changed this project, which is no longer shared, and it is saved nowhere. Keep a copy of it as a project of yours?':
    'Alterou este projeto, que já não é partilhado, e não está guardado em lado nenhum. Guardar uma cópia dele como um projeto seu?',
  'Not shared any more': 'Já não partilhado', 'Shared project': 'Projeto partilhado',
  'Shared project: who is in it, and its commands': 'Projeto partilhado: quem está nele, e os seus comandos',
  'Your name, as they see it:': 'O seu nome, como o veem:', 'you': 'você', 'owner': 'dono', 'follower': 'seguidor', 'viewer': 'espectador',
  'Others follow this project live with its link, read only: its files and drawings as they change, and what you do: your documents, views, simulations and runs. Of its builds, only the reports you open.':
    'Outros seguem este projeto em direto com a sua ligação, só de leitura: os ficheiros e os desenhos à medida que mudam, e o que faz: os seus documentos, vistas, simulações e processos. Das compilações, só os relatórios que abrir.',
  'This link follows a project someone shares: you see its files and drawings as they change, read only, and what its owner does (their documents, views, simulations, emulators and runs).':
    'Esta ligação segue um projeto que alguém partilha: vê os ficheiros e os desenhos à medida que mudam, só de leitura, e o que o seu dono faz (os seus documentos, vistas, simulações, emuladores e processos).',
  // (editors, #3182: web/js/collab-share.js)
  'Copy Editor Link': 'Copiar Ligação de Editor', 'Copy View Link': 'Copiar Ligação de Visualização', 'editor': 'editor',
  // (and every drawing: state diagrams, truth tables, ASM charts, Petri nets, schematics, #3183)
  'Anyone with the editors\' link edits its text files and drawings with you, live.':
    'Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.',
  // (a room the owner's page hosts, #3227: web/js/collab-host.js)
  'https://silinx-relay.<you>.workers.dev': 'https://silinx-relay.<o-seu-nome>.workers.dev',
  // (a relay of one's own on Cloudflare, #4574: web/js/relay-setup.js, the Collaboration tab's box)
  'Cloudflare Relay': 'Retransmissor Cloudflare', 'Cloudflare relay:': 'Retransmissor Cloudflare:',
  'No Cloudflare relay: your followers find you at the public meeting point.': 'Sem retransmissor Cloudflare: quem o segue encontra-o no ponto de encontro público.',
  'Set Up a Cloudflare Relay…': 'Configurar um Retransmissor Cloudflare…', 'Set Up a Cloudflare Relay': 'Configurar um Retransmissor Cloudflare',
  'Check Cloudflare Relay': 'Verificar o Retransmissor Cloudflare', 'Change Cloudflare Relay…': 'Mudar o Retransmissor Cloudflare…', 'Forget Cloudflare Relay': 'Esquecer o Retransmissor Cloudflare',
  'A relay of your own, on Cloudflare\'s free plan: your followers find you there, and connect through it when they cannot connect to you directly.':
    'Um retransmissor seu, no plano gratuito do Cloudflare: quem o segue encontra-o lá, e liga-se através dele quando não se consegue ligar diretamente a si.',
  '1. Its key, made here: copy it and keep it somewhere safe.': '1. A sua chave, feita aqui: copie-a e guarde-a num lugar seguro.',
  '2. Deploy it: sign in to Cloudflare (or sign up, free) and give the key when it asks for RELAY_KEY.':
    '2. Instale-o: entre no Cloudflare (ou registe-se, é gratuito) e dê a chave quando lhe pedir RELAY_KEY.',
  'Deploy to Cloudflare': 'Instalar no Cloudflare', '3. Its address, which Cloudflare shows at the end:': '3. O seu endereço, que o Cloudflare mostra no fim:',
  'New Key': 'Nova Chave', 'Check and Save': 'Verificar e Guardar',
  // (Cloudflare's screens, step by step, #4630; Cloudflare's own labels kept as Cloudflare shows them)
  'Cloudflare\'s screens, step by step': 'Os ecrãs do Cloudflare, passo a passo',
  'Deploy to Cloudflare opens Cloudflare\'s "Set up your application" page in a new tab: sign in, or create a free account.':
    'Instalar no Cloudflare abre a página "Set up your application" do Cloudflare num separador novo: entre, ou crie uma conta gratuita.',
  'Git account: choose your GitHub account, or New GitHub connection (GitLab works too). An account already connected needs nothing more. The first time, GitHub asks to install Cloudflare\'s app: if Only select repositories does not let Cloudflare create the new repository, give it All repositories, and narrow it afterwards in GitHub\'s Settings ▸ Applications.':
    'Conta Git: escolha a sua conta do GitHub, ou New GitHub connection (o GitLab também serve). Uma conta já ligada não precisa de mais nada. Da primeira vez, o GitHub pede para instalar a aplicação do Cloudflare: se Only select repositories não deixar o Cloudflare criar o repositório novo, dê-lhe All repositories, e restrinja-a depois em Settings ▸ Applications do GitHub.',
  'Tick Create private Git repository: Cloudflare makes your copy of the relay there. The key is a secret of Cloudflare\'s, not in the repository.':
    'Marque Create private Git repository: o Cloudflare faz lá a sua cópia do retransmissor. A chave é um segredo do Cloudflare, não está no repositório.',
  'Project name: leave silinx-relay. Your relay\'s address will be https://silinx-relay.<your subdomain>.workers.dev.':
    'Project name: deixe silinx-relay. O endereço do seu retransmissor será https://silinx-relay.<o seu subdomínio>.workers.dev.',
  'RELAY_KEY: paste the key copied in step 1.': 'RELAY_KEY: cole a chave copiada no passo 1.',
  'ORIGINS: leave https://pmnmalo.github.io, the Silinx site. To use the relay from Silinx\'s local server too, add it after a space: https://pmnmalo.github.io http://127.0.0.1:8642.':
    'ORIGINS: deixe https://pmnmalo.github.io, o sítio do Silinx. Para usar o retransmissor também a partir do servidor local do Silinx, acrescente-o depois de um espaço: https://pmnmalo.github.io http://127.0.0.1:8642.',
  'Build command empty, Deploy command npm run deploy, preview builds off: leave them as they are.':
    'Build command vazio, Deploy command npm run deploy, builds de pré-visualização desligados: deixe-os como estão.',
  'Click Deploy. Cloudflare sets up the repository, then builds the relay (Initializing, Cloning, Installing, Deploying): about 2 to 3 minutes. Wait for "Success! Build completed."':
    'Carregue em Deploy. O Cloudflare prepara o repositório e depois constrói o retransmissor (Initializing, Cloning, Installing, Deploying): cerca de 2 a 3 minutos. Espere por "Success! Build completed."',
  'The address: in the build log, under "Deployed silinx-relay triggers", or the Worker\'s Overview ▸ Domains & Routes. Paste it below and click Check and Save.':
    'O endereço: no registo da construção, em "Deployed silinx-relay triggers", ou em Overview ▸ Domains & Routes do Worker. Cole-o abaixo e carregue em Verificar e Guardar.',
  'Use the Deploy to Cloudflare button: Cloudflare\'s Create ▸ Import a repository only lists the repositories you already have. Your copy does not follow Silinx\'s: to update the relay, push the relay\'s new files to your repository, and Cloudflare deploys it again.':
    'Use o botão Instalar no Cloudflare: Create ▸ Import a repository do Cloudflare só lista os repositórios que já tem. A sua cópia não segue a do Silinx: para atualizar o retransmissor, envie (push) os novos ficheiros do retransmissor para o seu repositório, e o Cloudflare instala-o de novo.',
  // (Add a User…, #3996: web/js/collab-users.js, its code taken: web/js/collab-host.js)
  'Add a User…': 'Adicionar um Utilizador…', 'Add a User': 'Adicionar um Utilizador', 'Connect': 'Ligar', 'Take a Code…': 'Receber um Código…',
  'Role:': 'Papel:', 'Viewer': 'Espectador', 'Editor': 'Editor',
  'Give them the link of their role: they open it in Silinx.': 'Dê-lhe a ligação do seu papel: abre-a no Silinx.',
  'An editor edits its text files and drawings with you, live. Give this link only to whom you trust with them.':
    'Um editor edita os ficheiros de texto e os desenhos consigo, em direto. Dê esta ligação só a quem lhos confia.',
  'A viewer follows the project live, read only: its files and drawings, and what you do (your documents and cursor, your views, simulations, emulators and runs).':
    'Um espectador segue o projeto em direto, só de leitura: os ficheiros e os desenhos, e o que faz (os seus documentos e o cursor, as vistas, as simulações, os emuladores e os processos).',
  'This page hosts the project: a user whose page shows a code sends it to you, and Take a Code… takes it.':
    'Esta página aloja o projeto: um utilizador cuja página mostra um código envia-lho, e Receber um Código… recebe-o.',
  'Connect to the Owner': 'Ligar ao Dono', 'Copy Code': 'Copiar Código', 'Your code:': 'O seu código:', 'The owner\'s code:': 'O código do dono:',
  'A user gets a code when they open the link: paste it here.': 'Um utilizador recebe um código ao abrir a ligação: cole-o aqui.',
  'Send this code back to them: they paste it to connect.': 'Envie-lhe este código de volta: cola-o para se ligar.',
  'The owner\'s page shares this project itself. Send them your code (Add a User…, in their toolbar), then paste the code they send back.':
    'A página do dono partilha este projeto ela própria. Envie-lhe o seu código (Adicionar um Utilizador…, na barra de ferramentas dele) e cole depois o código que ele lhe enviar.',
  'This page hosts it: its followers find it when they open the link, or send you a code, which Add a User… takes.':
    'Esta página aloja-o: os seguidores encontram-na ao abrir a ligação, ou enviam-lhe um código, que Adicionar um Utilizador… recebe.',
  // (the live window, #3996: the name on it, Start Sharing)
  'Start Sharing': 'Começar a Partilhar', 'Your name first: the others see it.': 'O seu nome primeiro: os outros veem-no.',
  // (the meeting point, #3227: web/js/collab-meet.js)
  'Exchange Codes Instead': 'Trocar Códigos em Vez Disso',
  'Looking for the owner at the meeting point…': 'A procurar o dono no ponto de encontro…',
  'If they cannot be found there, you exchange codes with them instead.': 'Se não for encontrado aí, troca códigos com ele em vez disso.',
  // (Share Project… ▸ Live's two ways, #4634: web/js/share-via.js)
  'Others follow it as you work, on any network': 'Os outros seguem-no enquanto trabalha, em qualquer rede', 'Others follow it as you work, with no setup': 'Os outros seguem-no enquanto trabalha, sem configuração',
  'Live via your Cloudflare relay': 'Em direto pelo seu retransmissor Cloudflare', 'Live peer to peer (no relay)': 'Em direto ponto a ponto (sem retransmissor)',
  'Your followers meet you at a relay of your own on Cloudflare, then connect to you directly when they can, through the relay otherwise. It works on school and other locked-down networks, and counts against your free Cloudflare plan.':
    'Quem o segue encontra-o num retransmissor seu no Cloudflare e liga-se depois diretamente a si quando pode e, senão, através do retransmissor. Funciona nas redes das escolas e noutras redes restritas, e conta para o seu plano gratuito do Cloudflare.',
  'No setup: your followers find you at the public meeting point and connect browser to browser (WebRTC), or send you a code, which Add a User… takes. It may fail on school and other networks that block direct connections.':
    'Sem configuração: quem o segue encontra-o no ponto de encontro público e liga-se de navegador a navegador (WebRTC), ou envia-lhe um código, que Adicionar um Utilizador… recebe. Pode falhar nas redes das escolas e noutras que bloqueiam ligações diretas.',
  'No Cloudflare relay is set up yet: set one up first, here or in the Collaboration tab ▸ Cloudflare Relay.':
    'Ainda não há nenhum retransmissor Cloudflare configurado: configure um primeiro, aqui ou no separador Colaboração ▸ Retransmissor Cloudflare.',
  'Your relay:': 'O seu retransmissor:', 'Change…': 'Alterar…',
  // (the Collaboration tab's Sharing box while sharing, #4643: its mode, each follower's path, a long list folded)
  'Live peer to peer': 'Em direto ponto a ponto', 'Live via the Silinx server\'s relay': 'Em direto pelo retransmissor do servidor Silinx',
  'P2P': 'P2P', 'Relay': 'Retransmissor', 'Show fewer': 'Mostrar menos',
  'Peer to peer: directly between your browsers': 'Ponto a ponto: diretamente entre os vossos navegadores',
  'Through your Cloudflare relay: no direct path; counts against its free plan': 'Através do seu retransmissor Cloudflare: sem caminho direto; conta para o seu plano gratuito',
  'Through the Silinx server\'s relay': 'Através do retransmissor do servidor Silinx',
  'Role': 'Papel', 'This share has no editors\' link: share it again to let editors in': 'Esta partilha não tem ligação de editores: partilhe-a de novo para deixar entrar editores',
};

export const COLLAB_PT_PATTERNS = [
  [/^(\d+) more…$/, 'Mais $1…'],   // (the Collaboration tab's participants folded, #4643)
  [/^Read-only, following (.+)'s project$/, 'Só de leitura, a seguir o projeto de $1'],
  [/^Sharing \((\d+)\)$/, 'A partilhar ($1)'],
  [/^Through the relay at (.+)\.$/, 'Através do retransmissor em $1.'],
  // (the public servers a hosted room's follower reaches, #3361: web/js/collab-meet.js publicServers)
  [/^This page connects to public servers, which see your IP address: (?:the WebTorrent trackers (.+) \(to find its owner\)(?: and )?)?(?:the STUN servers? (.+))?\.$/,
    (_, t, s) => `Esta página liga-se a servidores públicos, que veem o seu endereço IP: ${[t ? `os rastreadores WebTorrent ${t} (para encontrar o dono)` : null,
      s ? (s.includes(',') ? `os servidores STUN ${s}` : `o servidor STUN ${s}`) : null].filter(Boolean).join(' e ')}.`],
  [/^Anyone with this link follows "(.+)" live, read only, as long as you share it\.$/, 'Quem tiver esta ligação segue "$1" em direto, só de leitura, enquanto o partilhar.'],
  [/^Anyone with this link follows "(.+)" live, read only, opening it on (\S+), as long as you share it\.$/, 'Quem tiver esta ligação segue "$1" em direto, só de leitura, aberto em $2, enquanto o partilhar.'],   // (#3631)
  // (the presence's button: the owner's name)
  [/^Following ([^."():]+)$/, 'A seguir $1'],
  [/^Follow ([^."():]+)$/, 'Seguir $1'],
  [/^Reconnecting to ([^."():]+)…$/, 'A religar a $1…'],   // (#3835)
  [/^Reconnecting…$/, 'A religar…'],   // (#3835: the owner's)
  // (a participant's role, #3997: the owner's Sharing menu)
  [/^Make (.+) an Editor$/, 'Tornar $1 Editor'], [/^Make (.+) a Viewer$/, 'Tornar $1 Espectador'],
];
