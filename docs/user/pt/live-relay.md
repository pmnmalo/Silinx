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
2. **Instale-o**: *Instalar no Cloudflare* abre o Cloudflare num separador novo. *Os ecrãs do Cloudflare, passo a
   passo*, na janela, diz o que lá encontra (abaixo).
3. **O seu endereço**: cole-o na janela e carregue em *Verificar e Guardar*.

### Os ecrãs do Cloudflare, passo a passo

Os nomes do Cloudflare estão em inglês, como o Cloudflare os mostra.

1. **Entrar.** *Instalar no Cloudflare* abre o painel do Cloudflare em *Workers & Pages* ▸ *Create an application* ▸
   **Set up your application**. Entre no Cloudflare, ou crie uma conta gratuita.
2. **Conta Git.** A lista mostra as contas já ligadas, e *New GitHub connection* / *New GitLab connection*. Escolha a
   sua conta do GitHub, a que o separador Colaboração do Silinx já usa (o GitLab funciona da mesma maneira). Uma conta
   já ligada não precisa de mais nada. Da primeira vez, o GitHub pede para instalar a aplicação do Cloudflare
   (*Cloudflare Workers and Pages*) e quais os repositórios que pode usar. O Cloudflare cria um repositório novo para o
   retransmissor: se *Only select repositories* não o deixar, dê-lhe **All repositories**, e depois de o retransmissor
   estar instalado restrinja-a no GitHub: *Settings* ▸ *Applications* ▸ *Cloudflare Workers and Pages* ▸ *Configure* ▸
   *Only select repositories*, só o repositório do retransmissor.
3. **Repositório.** O Cloudflare diz que vai criar um repositório Git para si e que cada push para ele é instalado.
   Marque **Create private Git repository**. A sua cópia do retransmissor fica lá; a chave não está nele (é um
   segredo guardado pelo Cloudflare).
4. **Project name.** Deixe `silinx-relay`. Passa a ser o endereço do seu retransmissor,
   `https://silinx-relay.<o seu subdomínio>.workers.dev`.
5. **RELAY_KEY.** Um campo de palavra-passe: cole a chave que o Silinx fez e copiou.
6. **ORIGINS.** Deixe `https://pmnmalo.github.io`, o sítio do Silinx. Se também usa o servidor local do Silinx
   (`silinx serve`) ou outro sítio do Silinx, acrescente o seu endereço depois de um espaço, por exemplo
   `https://pmnmalo.github.io http://127.0.0.1:8642`.
7. **Comandos de construção e instalação.** *Build command* vazio, *Deploy command* `npm run deploy` (corre
   `wrangler deploy`), builds de pré-visualização desligados: deixe-os como estão.
8. **Deploy.** Carregue em *Deploy*. O Cloudflare diz *Setting up your repository…*, cria o seu repositório
   (`<a sua conta>/silinx-relay`) e abre a página da construção do Worker: *Initializing* (cerca de minuto e meio),
   *Cloning*, *Installing*, *Deploying*. A construção toda leva cerca de 2 a 3 minutos e acaba em
   **Success! Build completed.** Os dois avisos do registo sobre `workers_dev` e `preview_urls`, de um retransmissor
   copiado antes de novembro de 2026, são inofensivos.
9. **O endereço.** No registo da construção, em *Deployed silinx-relay triggers* (ou em *Overview* do Worker,
   *Domains & Routes*): `https://silinx-relay.<o seu subdomínio>.workers.dev`, o subdomínio muitas vezes o nome da sua
   conta. Aberto no browser, responde "A relay of Silinx's shared projects". Cole-o na janela do Silinx e carregue em
   *Verificar e Guardar*.

Armadilhas:

- Use o botão *Instalar no Cloudflare*. *Workers & Pages* ▸ *Create* ▸ *Import a repository* do Cloudflare só lista os
  repositórios que já tem: não faz a cópia.
- A sua cópia não segue a do Silinx. Para atualizar o retransmissor, envie (push) os novos ficheiros do retransmissor
  ([`packages/silinx-relay-cloudflare`](../../../packages/silinx-relay-cloudflare/README.md)) para o seu repositório:
  o Cloudflare instala cada push.
- O plano gratuito tem limites diários (abaixo).

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

A linha *Partilhar:* de *Partilhar Projeto…*, no topo da janela, oferece três formas: **Uma cópia**, **Em direto ponto
a ponto (sem retransmissor)** e **Em direto pelo seu retransmissor Cloudflare**; algumas frases logo abaixo da linha dizem o
que faz a forma escolhida. **Em direto pelo seu retransmissor Cloudflare** vem escolhida por omissão quando o retransmissor está configurado: a janela mostra o seu
endereço (nunca a chave) abaixo de *O seu nome*, e *Alterar…* abre de novo *Configurar um Retransmissor Cloudflare…*. Sem retransmissor
configurado, a janela di-lo e oferece *Configurar um Retransmissor Cloudflare…*, e *Começar a Partilhar* espera até haver
um. **Em direto ponto a ponto (sem retransmissor)** não precisa de configuração: quem o segue encontra-o no ponto de
encontro público e liga-se de navegador a navegador, ou envia-lhe um código (*Adicionar um Utilizador…*); pode falhar em
redes que bloqueiam ligações diretas. A janela lembra-se da forma escolhida da última vez. A ligação indica o
retransmissor, por isso quem o segue só precisa da ligação: nem chave, nem conta.

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
