# O Emulador da Placa

[Guia do utilizador](README.md) · [English](../en/emulator.md) · Português

O Emulador da Placa corre o projeto num desenho da placa real, ligado pelas suas restrições: mude os interruptores,
carregue nos botões, e veja os LEDs, os mostradores de 7 segmentos e o monitor VGA, à velocidade real da placa. Sem
placa e sem nada a instalar: funciona no browser, também num tablet. Num telemóvel a placa ajusta-se à largura do
ecrã, e os seus interruptores e botões repetem-se por baixo dela, grandes o bastante para o dedo.

![O exemplo stopwatch numa Basys2 emulada](../../images/emulator-basys2-pt.webp)

*Emular* (a tarefa Emular da interface Silinx) ou *Emular ▸ Emular Modelo Comportamental (RTL)* (a interface
ao estilo do ISE) abre-o com o módulo de topo do projeto. O painel lateral de Emular mostra o projeto, o seu
dispositivo e o seu módulo de topo, com os processos da emulação por baixo: Planeamento de Pinos de E/S, e Emular com
os seus modelos.

## Placas

A Basys2, a Nexys2, a Nexys3, a Atlys, a Basys 3, a Nexys A7, o Spartan-3E Starter Kit, a iCEBreaker, a ULX3S, a Tang
Nano 9K, a Zybo Z7 e a Arty Z7 (entre outras) são desenhadas tal como são, incluindo a cor da placa; as outras placas (a
placa de avaliação GateMate, a Arty S7…) têm um painel genérico. Na Zybo Z7 e na Arty Z7 as peças do sistema de
processamento (o LED e os botões MIO, o PS-SRST) estão desenhadas mas não são emuladas. O que um exemplo precisa e essa
placa não tem (o mostrador de 4 dígitos, os LEDs e os interruptores para além dos seus, na Zybo Z7, na Arty Z7 e na Arty
S7), que as restrições põem nas suas Pmods, é desenhado numa breadboard por baixo da placa, cada módulo com o nome das
suas Pmods, e emulado como as peças da própria placa; o menu da barra de ferramentas esconde-o (*Módulos nos conectores*).

| Uma Nexys3 e o seu monitor VGA (o exemplo vga) | Uma iCEBreaker e os seus Pmods (o exemplo clock) |
|---|---|
| ![O exemplo vga numa Nexys3 emulada](../../images/emulator-nexys3.webp) | ![O exemplo clock numa iCEBreaker emulada](../../images/emulator-icebreaker.webp) |

## O que mostra

- Os LEDs, o mostrador de 7 segmentos multiplexado (com a persistência da visão), os interruptores e os botões.
- Um **monitor VGA**: a imagem de 640×480 que o projeto desenha, os tempos da sincronização medidos e o que estiver
  errado assinalado.
- Uma **lista de observação** de sinais internos, e a frequência do relógio, em tempo real ou mais devagar.
- Dois motores: o projeto **compilado** (dezenas de milhões de ciclos por segundo), ou a simulação do HDL **por
  eventos**, para depurar.

## Carregar nos botões

Um botão clicado (ou tocado) fica em baixo, aceso, até o projeto ter corrido com ele tanto quanto um toque real, uma
décima de segundo do tempo da placa, para que o debouncer do projeto o apanhe quando o emulador corre mais devagar que
o tempo real; nunca mais de um segundo, porém: o motor por eventos, muito mais lento, solta-o ao fim de um segundo, e
um projeto com debouncer precisa então do botão em baixo durante mais tempo (Shift+clique).
Um clique feito com o emulador em pausa é guardado da mesma maneira: o botão fica em baixo, e o projeto apanha o toque
quando voltar a correr (*Executar*). **Shift+clique** mantém um botão em baixo até novo Shift+clique; o
*Desligar/ligar* solta todos os botões.

Também corre o que as ferramentas construíram (os modelos depois da síntese até depois do posicionamento e
encaminhamento), para confirmar que o projeto sintetizado ainda faz o que o HDL dizia.

A seguir: [Placas e ferramentas](boards.md). Em pormenor: [as funcionalidades](../en/features.md) (em inglês).
