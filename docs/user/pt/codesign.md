# Co-design: uma FPGA e um microcontrolador juntos

[Guia do utilizador](README.md) · [English](../en/codesign.md) · Português

Um **projeto de co-design** é um sistema de nós de FPGA e de microcontrolador ligados entre si, desenhado e simulado
como um todo: um módulo FPGA do projeto na sua placa, um Arduino Uno ou Nano com o seu firmware, um terminal série,
ligados por UART e GPIO.

## Um projeto de co-design

- **Novo Projeto ▸ Co-design.** Não tem placa própria: cada nó FPGA do seu Sistema indica a sua placa e os pinos, cada
  microcontrolador o seu firmware. Comece **Vazio** (o seu Sistema, `<nome>.sys.json`, ainda sem nós) ou pelo exemplo
  **uart-avr** (um Arduino e a FPGA do exemplo `uart` ligados por UART).
- **O seu Sistema** é o topo, no painel Design como `<nome> [System]`, com os módulos dos nós FPGA por baixo. Abre no
  **editor de Sistema**: as ferramentas põem um nó FPGA, um Arduino Uno ou Nano, um terminal série; **Ligação** junta
  duas interfaces do mesmo tipo (um clique numa, depois na outra); o painel de Propriedades indica o módulo, a placa e
  os pinos de um nó, a placa e o firmware de um microcontrolador (um Intel HEX, `.hex`, ou o `.elf` do avr-gcc; um
  `.elf` na edição do browser precisa de uma pasta de trabalho, o seu armazenamento só guarda ficheiros de texto), os
  portos TX e RX, o baud e a trama de uma interface.
- **A verificação** mostra os erros e os avisos na consola enquanto se edita, e Verificar escreve-os na Consola: um
  porto que não é do módulo, TX e RX trocados, bauds diferentes nas duas pontas de uma ligação, um nó que não liga a
  nada, e uma saída de 5 V numa entrada de 3,3 V da FPGA (o TX de um Arduino no RX de uma FPGA: nas placas reais, um
  conversor de nível ou um divisor).
- **As ligações GPIO** juntam pinos um a um: **+ GPIO** num nó acrescenta a sua interface, os seus pinos (os portos do
  módulo de um nó FPGA, um bit de um barramento como `led<0>`; os D2, A0… de um Arduino) e a sua direção no painel de
  Propriedades, e **Ligação** junta-a ao GPIO de outro nó com tantos pinos. A sua verificação: duas saídas no mesmo
  fio, duas entradas (nada comanda o fio), um pino ligado duas vezes, e a saída de 5 V numa entrada de 3,3 V da FPGA.
  Experimentar corre-a como um fio, as suas alterações no inspetor de ligações e nas ondas.
- **As ligações SPI** juntam um Arduino, o mestre, a uma FPGA, o periférico: **+ SPI** no Arduino acrescenta o SPI da
  placa (SCK D13, MOSI D11, MISO D12; o SS é o D10, um pino do próprio programa), **+ SPI** num nó FPGA os quatro portos
  do seu módulo (encontrados pelos nomes: sck, mosi, miso, ss), e **Ligação** junta-os. Cada ponta indica o ritmo do SCK
  (pelo menos o do programa: 125000 Hz com SPI_CLOCK_DIV128) e o modo (0 a 3), os mesmos nas duas. Experimentar mostra os
  bytes de cada transferência, os do MOSI e os do MISO, nas linhas da consola. O exemplo **spi-avr**: um Arduino envia
  uma contagem a cada 47 ms, mais ou menos, a FPGA mostra-a nos seus LEDs e responde com a anterior mais um, mostrada nos
  D2..D7 do Arduino.

## Experimentar

**Experimentar**, na barra do editor de Sistema, abre a vista de simulação por baixo da tela, o painel verde de Experimentar. **Correr 100 ms** (ou Correr,
depois Pausa) corre o Sistema todo junto: os módulos dos nós FPGA compilados (Yosys) para o motor compilado ao relógio
da sua placa, o firmware do Arduino corrido pelo avr8js a 16 MHz, tudo num Web Worker, determinístico. Mostra:

- **o inspetor de ligações**: cada fio de cada ligação (uma ligação UART tem dois, um em cada sentido) com os bytes
  descodificados, o seu texto e, em cada byte, o seu tempo;
- **um terminal** por cada nó terminal: o que recebeu, e uma linha escrita aí enviada com Enter;
- **Ondas**: as formas de onda de todo o Sistema no visualizador, um âmbito por nó e um para as ligações.

Os avisos dos nós (um byte perdido no AVR, um erro de trama) aparecem na consola. O assistente de IA faz o mesmo com as
ferramentas `edit_system`, `check_system` e `simulate` do servidor MCP (o Sistema de um projeto de co-design; as
ondas em `build/<nome>.vcd`).

## Emular

**Emular**, na barra do editor de Sistema (ou **Emular o Sistema** no menu da linha do Sistema no painel Design), abre o
emulador do Sistema num separador próprio:
- a placa de cada nó FPGA desenhada como o Board Emulator a desenha, e uma Arduino como o Silinx a desenha, lado a lado;
- **Executar** corre-as todas juntas em tempo real, e **Pausa** para-as;
- um clique num interruptor ou num botão de uma placa FPGA: o seu módulo vê-o como na placa real;
- os LEDs e os displays de uma placa FPGA acendem como o seu módulo os comanda;
- os pinos de uma Arduino mostram o seu nível (aceso alto, escuro baixo, vazio flutuante) e o seu LED L acende com o D13;
- cada terminal série está no painel **Terminais**: escreva uma linha, Enter envia-a.

A linha de estado mostra o tempo e a rapidez com que as placas correm face ao tempo real.

## Experimente: o exemplo uart-avr

1. Novo Projeto ▸ **Co-design**, Começar por **Exemplo: uart-avr**, Concluir. O Sistema abre: `uno` (um Arduino Uno com
   `firmware/hello.hex`) ligado por `serial` a `fpga` (o módulo `uart` numa Basys2).
2. **Experimentar**, depois **Correr 100 ms**. No inspetor de ligações, `serial_uno` (o TX do Arduino para o RX da FPGA)
   mostra `Hello from Arduino!` e `serial_fpga` (o TX da FPGA de volta) o mesmo texto: a FPGA devolve cada byte.
3. **Ondas**: o D1 e o D0 do Arduino, o rx e o tx da FPGA, e os dois fios, ao longo dos 100 ms.

O código do firmware é `firmware/hello.asm`: envia a saudação e depois mostra no porto B cada byte que recebe.
