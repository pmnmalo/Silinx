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
  'Not shared any more': 'Já não partilhado', 'Shared project': 'Projeto partilhado',
  'Shared project: who is in it, and its commands': 'Projeto partilhado: quem está nele, e os seus comandos',
  'Your name, as they see it:': 'O seu nome, como o veem:', 'you': 'você', 'owner': 'dono', 'follower': 'seguidor', 'viewer': 'espectador',
  'Others follow this project live with its link, read only: its files and drawings as they change, and what you do: your documents and cursor, your views and selection, your simulations, emulators and runs. Of its builds, only the reports you open are shared.':
    'Outros seguem este projeto em direto com a sua ligação, só de leitura: os ficheiros e os desenhos à medida que mudam, e o que faz: os seus documentos e o cursor, as vistas e a seleção, as simulações, os emuladores e os processos. Das compilações, só são partilhados os relatórios que abrir.',
  'This link follows a project someone shares: you see its files and drawings as they change, read only, and what its owner does (their documents, views, simulations, emulators and runs).':
    'Esta ligação segue um projeto que alguém partilha: vê os ficheiros e os desenhos à medida que mudam, só de leitura, e o que o seu dono faz (os seus documentos, vistas, simulações, emuladores e processos).',
  // (editors, #3182: web/js/collab-share.js)
  'Copy Editor Link': 'Copiar Ligação de Editor', 'editor': 'editor',
  // (and every drawing: state diagrams, truth tables, ASM charts, Petri nets, schematics, #3183)
  'Anyone with the editors\' link edits its text files and drawings with you, live.':
    'Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.',
  // (a room the owner's page hosts, #3227: web/js/collab-host.js)
  'Through a relay (a Silinx server that lets this site in); else this page hosts it': 'Através de um retransmissor (um servidor Silinx que deixa entrar este sítio); senão, esta página aloja-o',
  'The relay\'s address:': 'O endereço do retransmissor:', 'Its key (from its administrator):': 'A sua chave (do seu administrador):',
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
};

export const COLLAB_PT_PATTERNS = [
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
