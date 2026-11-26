# Sistemas: uma FPGA e um microcontrolador juntos

[Guia do utilizador](README.md) · [English](../en/systems.md) · Português

Um **projeto de Sistema** é um sistema de nós de FPGA e de microcontrolador ligados entre si, desenhado e simulado
como um todo: um módulo FPGA do projeto na sua placa, um Arduino Uno ou Nano com o seu firmware, um terminal série,
ligados por UART e GPIO.

## Um projeto de Sistema

- **Novo Projeto ▸ Sistema.** Não tem placa própria: cada nó FPGA do seu Sistema indica a sua placa e os pinos, cada
  microcontrolador o seu firmware. Comece **Vazio** (o seu Sistema, `<nome>.sys.json`, ainda sem nós) ou pelo exemplo
  **uart-avr** (um Arduino e a FPGA do exemplo `uart` ligados por UART).
- **Um Sistema como topo de um projeto FPGA**: o Tipo de Fonte de Topo **Sistema** (Novo Projeto,
  Propriedades do Projeto), ou **Definir como Módulo de Topo** num Sistema (`.sys.json`, na vista Ficheiros), torna o
  projeto um projeto de Sistema, esse Sistema o seu topo; a placa fica guardada. **Definir como Módulo de Topo** num dos
  seus módulos torna-o de novo um projeto FPGA, na placa do nó FPGA que corre esse módulo (senão, na placa que tinha).
- **O seu Sistema** é o topo, no painel Design como `<nome> [System]`, cada um dos seus nós um ramo por baixo (#5414):
  um nó FPGA com a placa e a hierarquia do módulo, um Arduino com a placa e o firmware, um nó circuito com o desenho, um
  terminal. Selecionar um nó mostra os seus processos (Ver/Editar Sistema; num nó FPGA, Verificar Sintaxe, o esquemático
  RTL, e Sintetizar, Implementar e Gerar o Ficheiro de Programação na sua própria placa, em `build/nodes/<id>/`, #5446);
  a linha do Sistema tem Ver/Editar, Verificar, Emular e Implementar o Sistema (todos os nós FPGA). Abre no
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
- **As ligações I²C** juntam um Arduino, o mestre, a uma FPGA, o periférico: **+ I²C** no Arduino acrescenta o
  barramento I²C da placa, o Wire (SCL A5, SDA A4), **+ I²C** num nó FPGA os dois portos do seu módulo (encontrados
  pelos nomes: scl, sda), o SDA um porto inout (`sda <= '0' when pull = '1' else 'Z'`: puxado a 0 ou largado, nunca
  comandado a 1), e **Ligação** junta-os. Cada ponta indica o ritmo do SCL (pelo menos o do programa: 100000 Hz com o
  Wire), o mesmo nas duas. Experimentar mostra cada transferência nas linhas da consola: W ou R, o endereço, os bytes
  (NACK onde um não foi confirmado), e avisa de um endereço que nenhum periférico confirmou. O exemplo **i2c-avr**: um
  Arduino escreve uma contagem a cada 47 ms, mais ou menos, na FPGA no endereço 0x42, mostrada nos seus LEDs, e lê de
  volta os interruptores da FPGA, mostrados nos D2..D7 do Arduino.
- **Fios**, na barra do editor de Sistema, mostra cada ligação pino a pino: as duas placas frente a frente, uma linha
  por fio com o seu sinal (TX, SCK, SDA…), o pino em cada ponta (o porto de uma FPGA e o seu pino do encapsulamento,
  `rx · J3`; o `D1` de um Arduino), os níveis e uma seta para a entrada. Um fio com uma saída de 5 V numa entrada de
  3,3 V fica a laranja, o seu aviso na dica, tal como o lugar de um pino da FPGA na placa (`UART RX on a PmodUSBUART
  in JA…`). A vista é só de leitura: as ligações editam-se na vista do Sistema; um clique num fio seleciona a sua
  ligação. Fios outra vez volta atrás.
- **As placas num circuito**: o painel das peças do editor de circuitos tem **Placas**, o Arduino Uno e o Nano, a
  Basys2 e a Nexys2, com os seus pinos reais (D0…D13, A0…; os pinos Pmod de uma placa FPGA, JA1…, cada um com o seu
  pino do encapsulamento na dica), cada uma desenhada como os emuladores a desenham, à escala do circuito, os seus pinos
  onde estão os dos seus conectores e Pmods. Um Nano fica sobre o canal de uma placa de ensaio. Os 5V, 3V3 e GND de uma placa
  alimentam a placa de ensaio; os outros pinos são do seu programa ou do seu projeto, conduzidos quando o circuito for um
  nó do Sistema (sozinhos, no Try it, não conduzem nada).
- **Um circuito entre as placas**: **Circuito**, na barra do editor de Sistema, acrescenta um nó circuito, um circuito do
  projeto (o Circuito das suas Propriedades). Dê a cada placa do circuito a etiqueta do id do seu nó (um Uno com a
  etiqueta `uno` é o nó uno): os pinos que o circuito liga são então ligações do Sistema, os de um Arduino nos dois
  sentidos, os de uma FPGA no sentido do porto desse pino. O Check diz uma placa que não nomeia nenhum nó, um pino que é
  também de uma ligação, e um pino de 5 V de um Arduino numa entrada de 3,3 V da FPGA; o Try it corre o circuito com as
  placas e diz cada LED (aceso no fim, as vezes que acendeu). O **Emular** desenha o circuito ao lado das placas: os
  LEDs acendem à medida que corre, e um clique muda um interruptor ou carrega num botão (premido enquanto o rato o
  carrega), como na bancada.

## Mapas de registos

Um **mapa de registos** (New Source ▸ **Register Map**, `<nome>.regs.json`) declara uma vez os registos que um
periférico na FPGA mostra ao Arduino, e o Silinx gera os dois lados:

- **o módulo da FPGA**, com o nome do mapa, em VHDL ou Verilog (a linguagem do projeto), com os registos atrás de um
  escravo SPI (modo 0) ou I²C (no endereço do mapa, o SDA um porto inout). O seu ficheiro HDL é feito a partir do
  mapa, como o de um desenho: no painel Design, a linha do mapa tem primeiro o selo **Registers**;
- **o cabeçalho do Arduino**: o botão **Header** do editor escreve `<nó>/<nome>.h` (a pasta do primeiro microcontrolador do Sistema), com os endereços dos registos e
  um `<nome>_read_<registo>()` e um `<nome>_write_<registo>(v)` para cada um, por `SPI` ou `Wire`.

O editor é uma tabela, uma linha por registo: o endereço (um registo ocupa um endereço de byte por cada 8 bits, o byte
menos significativo primeiro), o nome, a largura (1 a 32 bits), o acesso (**rw**: escrito pelo programa e lido de
volta, uma saída do módulo; **ro**: só de leitura, uma entrada do módulo, da sua lógica; **wo**: só de escrita) e o
valor de reset; **Strobe** acrescenta uma saída `<nome>_wr`, um impulso de um ciclo de relógio quando o registo é
escrito. **+ Register** acrescenta um a seguir ao último; a barra escolhe o barramento (SPI, ou I²C e o seu endereço);
**Check** diz os problemas (dois registos no mesmo endereço, um nome que o módulo usa ele próprio…) na consola. No SPI,
uma transação é um byte de comando (`R << 7 | endereço`) e depois os bytes de dados; no I²C, o endereço do registo e
depois os dados, uma leitura depois de um START repetido. Em **Experimentar**, uma ligação a um nó FPGA feito a partir
de um mapa diz os seus acessos nas linhas da consola: `write duty = 0xa5`, `read count → 0x0123`, quando a corrida para (depois das transferências de cada ligação SPI e
I²C). O exemplo **regs-avr** mostra-o: o seu módulo da FPGA, `pwm_top`, instancia o escravo do mapa
`pwm_regs.regs.json` (`duty`, o PWM do LD0, os seus bits nos LD7..LD1; `count`, os milissegundos desde o `clear`;
`clear`, um impulso); o Arduino escreve o `clear` uma vez e depois, a cada 47 ms mais ou menos, escreve o `duty` com
uma contagem e lê o `count`, o seu byte baixo nos D2..D7.

## Experimentar

**Experimentar**, na barra do editor de Sistema, abre a vista de simulação por baixo da tela, o painel verde de Experimentar. **Correr 100 ms** (ou Correr,
depois Pausa) corre o Sistema todo junto: os módulos dos nós FPGA compilados (Yosys) para o motor compilado ao relógio
da sua placa, o firmware do Arduino corrido pelo avr8js a 16 MHz, tudo num Web Worker, determinístico. Mostra:

- **o inspetor de ligações**: cada fio de cada ligação (uma ligação UART tem dois, um em cada sentido) com os bytes
  descodificados, o seu texto e, em cada byte, o seu tempo;
- **um terminal** por cada nó terminal: o que recebeu, e uma linha escrita aí enviada com Enter;
- **Ondas**: as formas de onda de todo o Sistema no visualizador, um âmbito por nó e um para as ligações.

Os avisos dos nós (um byte perdido no AVR, um erro de trama) aparecem na consola. O assistente de IA faz o mesmo com as
ferramentas `edit_system`, `check_system` e `simulate` do servidor MCP (o Sistema de um projeto de Sistema; as
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
- a **Placa Real…** de um terminal liga-o à porta série USB de uma placa real pelo Web Serial (Chrome e Edge; não o
  Safari, nem o iPad): a de um Arduino, escolhida entre os identificadores USB da sua placa, ou o adaptador USB-UART de
  uma placa FPGA. A porta abre com o baud e a trama da ligação; o terminal mostra o que a placa envia, como a simulação o
  mostra, e a linha escrita vai para a placa. **Desligar** devolve o terminal à emulação. O `serial_terminal` do
  servidor MCP faz o mesmo no servidor local, pelo monitor do arduino-cli.

A linha de estado mostra o tempo e a rapidez com que as placas correm face ao tempo real.

## Nas placas reais

Na tarefa **Implementar**, **Programar Tudo** programa cada nó na sua placa (primeiro os nós FPGA), e o **Programar Nó**
de um nó só esse nó. O servidor local encontra cada placa pelo seu identificador USB; o firmware de um Arduino é
carregado pelo upload do arduino-cli.

O firmware de um Arduino Uno ou Nano também pode ser carregado a partir do browser pelo **Web Serial** (Chrome e Edge;
não o Safari, nem o iPad): o seu `.hex` (ou `.elf`) passa pelo bootloader da placa (STK500, como o Arduino IDE faz) e é
depois lido e comparado. A edição para browser faz sempre assim (os seus nós FPGA são programados pelo servidor local,
por agora); com o servidor local, o **Programar Nó** de um Arduino cuja placa ele não vê oferece **Web Serial…** na
janela *Escolher a Placa*.

## Experimente: o exemplo uart-avr

1. Novo Projeto ▸ **Sistema**, Começar por **Exemplo: uart-avr**, Concluir. O Sistema abre: `uno` (um Arduino Uno com
   `uno/hello.hex`) ligado por `serial` a `fpga` (o módulo `uart` numa Basys2).
2. **Experimentar**, depois **Correr 100 ms**. No inspetor de ligações, `serial_uno` (o TX do Arduino para o RX da FPGA)
   mostra `Hello from Arduino!` e `serial_fpga` (o TX da FPGA de volta) o mesmo texto: a FPGA devolve cada byte.
3. **Ondas**: o D1 e o D0 do Arduino, o rx e o tx da FPGA, e os dois fios, ao longo dos 100 ms.

O código do firmware é `uno/hello.asm`: envia a saudação e depois mostra no porto B cada byte que recebe.
