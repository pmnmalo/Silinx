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

## Montá-lo, uma vez, a partir do Silinx

No separador **Colaboração**, a caixa **Retransmissor Cloudflare**: *Configurar um Retransmissor Cloudflare…*.

1. **A sua chave**: o Silinx faz uma chave longa e aleatória na sua página. *Copie-a* e guarde-a bem, como uma
   palavra-passe.
2. **Instale-o**: *Instalar no Cloudflare* abre num separador novo. Entre no Cloudflare, ou crie uma conta gratuita, e
   deixe-o copiar o retransmissor para a sua conta do GitHub. Quando pedir `RELAY_KEY`, cole a chave.
3. **O seu endereço**: no fim, o Cloudflare mostra-o, `https://silinx-relay.<o seu nome>.workers.dev`. Cole-o na janela e
   carregue em *Verificar e Guardar*.

O Silinx verifica o retransmissor antes de o guardar: responde como um retransmissor dos projetos partilhados do Silinx,
deixa entrar o sítio do Silinx, e a sua chave abre um ponto de encontro. O que encontrou está na consola. Se o
retransmissor não deixar entrar o sítio, a consola dá a linha exata a definir, `ORIGINS = "…"`: defina-a no painel do
Cloudflare (*Settings* ▸ *Variables and Secrets* do Worker) ou no `wrangler.toml`, e instale-o de novo.

A caixa mostra então o retransmissor, com *Verificar o Retransmissor Cloudflare*, *Mudar o Retransmissor Cloudflare…* e
*Esquecer o Retransmissor Cloudflare*. O Silinx nunca precisa da sua conta do Cloudflare nem de um token da sua API: só
do endereço do retransmissor e da sua chave, que ficam neste browser e nunca vão numa ligação.

### A partir de um terminal

Na [pasta do retransmissor](../../../packages/silinx-relay-cloudflare/README.md): `npx wrangler deploy`, e depois
`npx wrangler secret put RELAY_KEY`. Depois indique o endereço e a chave em *Configurar um Retransmissor Cloudflare…*.

## Partilhar através dele

*Partilhar Projeto…* ▸ *Ao vivo* usa-o por omissão: **Retransmissor Cloudflare** (o endereço) e **A sua chave
(RELAY_KEY)** vêm preenchidos. Mude-os aí, ou apague-os para partilhar sem ele. A ligação indica o retransmissor, por
isso quem o segue só precisa da ligação: nem chave, nem conta.

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
follow_project do servidor MCP passam pelos retransmissores que as definições do utilizador indicam. A sua ferramenta
`live_relay` define um retransmissor Cloudflare seu (uma chave feita, o retransmissor verificado, guardado no
`config.json`), e o `share_project` com `relay: true` partilha através dele.
