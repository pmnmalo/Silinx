# Um retransmissor seu para a partilha ao vivo

[Guia do utilizador](README.md) · [English](../en/live-relay.md) · Português

Quando partilha um projeto ao vivo a partir do sítio do Silinx, é a sua página que o aloja. Quem o segue liga-se à sua
página **diretamente** (ponto a ponto, WebRTC) quando a rede o permite. Antes disso, tem de encontrar a sua página, e
pode fazê-lo de três maneiras:

- **um retransmissor seu**, que também leva as mensagens de quem não consegue ligar-se diretamente (uma rede que não
  deixa passar UDP, como muitas redes de escolas e de empresas);
- o ponto de encontro público (trackers WebTorrent de terceiros), quando não indica retransmissor;
- um código trocado à mão (*Adicionar um Utilizador…*), em último caso.

Um retransmissor seu no plano gratuito do Cloudflare monta-se em poucos minutos e não precisa de servidor. Cada pessoa
monta o seu: o professor para as suas turmas, o aluno para o seu grupo. O que gasta do plano gratuito conta na conta de
quem o montou.

## Montá-lo, uma vez

1. Abra a [página do retransmissor](../../../packages/silinx-relay-cloudflare/README.md) e carregue em **Deploy to
   Cloudflare**.
2. Entre no Cloudflare, ou crie uma conta gratuita. Deixe-o copiar o retransmissor para a sua conta do GitHub.
3. Quando pedir `RELAY_KEY`, dê uma chave longa e aleatória (24 caracteres pelo menos) e guarde-a bem, como uma palavra-passe.
4. No fim, mostra o endereço do retransmissor, `https://silinx-relay.<o seu nome>.workers.dev`. Abra-o: responde
   "A relay of Silinx's shared projects".

O Silinx nunca precisa da sua conta do Cloudflare nem de um token da sua API: só do endereço do retransmissor e da sua
chave.

## Partilhar através dele

Em *Partilhar Projeto…* ▸ *Ao vivo*, preencha **Retransmissor** (o endereço) e **A sua chave**, e depois *Começar a
Partilhar*. Este browser lembra-se deles. A ligação indica o retransmissor, por isso quem o segue só precisa da ligação:
nem chave, nem conta.

O retransmissor não vê nenhum ficheiro. Tudo vai cifrado com a chave da ligação, que o retransmissor nunca tem. Só vê
quantas mensagens passam e quando.

Se apagar os dados do browser, o retransmissor e a chave são esquecidos: volte a indicá-los. O retransmissor continua
onde está. O seu endereço está no painel do Cloudflare (*Workers & Pages*). Se perder a chave, defina uma nova lá
(*Settings* ▸ *Variables and Secrets*) ou com `npx wrangler secret put RELAY_KEY`; a antiga deixa de funcionar.

## O que dá o plano gratuito

O plano gratuito do Cloudflare conta por conta e por dia (veja a página de preços do Cloudflare para os valores atuais):

- **100 000 pedidos por dia**: cada mensagem que o retransmissor recebe conta (as mensagens WebSocket contam como uma
  fração de pedido: veja a página de preços).
- **13 000 GB-s de duração por dia**: o tempo em que uma sala ou um ponto de encontro está acordado. Um que esteja calado
  adormece e não gasta nada até chegar uma mensagem.

Ponto a ponto, o retransmissor só leva a sinalização. Num teste de três pessoas (20 edições, 60 movimentos do cursor),
passou 30 mensagens para as ligar e nenhuma depois. Através do retransmissor, a mesma sessão levou 240. Por isso, quase
toda a turma se liga quase sem custo. Só quem está numa rede que bloqueia os caminhos diretos usa o retransmissor em
todas as mensagens: é isso que conta.

Quando se chega a um limite, o retransmissor recusa até ao dia seguinte. Quem o segue usa então o ponto de encontro
público ou um código, e quem não consegue ligar-se diretamente não pode seguir.

## O retransmissor de um servidor Silinx

Um servidor Silinx (`silinx serve`) tem o seu próprio retransmissor, que as suas páginas usam. O retransmissor de outro
servidor pode ser indicado no `config.json` (`relay.relays`, com `relay.key` nesse servidor). O share_project e o
follow_project do servidor MCP passam pelos retransmissores que as definições do utilizador indicam, um do Cloudflare
também.
