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
  duas interfaces do mesmo tipo (um clique numa, depois na outra); o painel de Propriedades indica o módulo, a placa e os
  pinos de um nó, a placa e o firmware de um microcontrolador (um Intel HEX, `.hex`, no browser), os portos TX e RX, o
  baud e a trama de uma interface.
- **A verificação** mostra os erros e os avisos na consola enquanto se edita, e Verificar escreve-os na Consola: um
  porto que não é do módulo, TX e RX trocados, bauds diferentes nas duas pontas de uma ligação, um nó que não liga a
  nada, e uma saída de 5 V numa entrada de 3,3 V da FPGA (o TX de um Arduino no RX de uma FPGA: nas placas reais, um
  conversor de nível ou um divisor).

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

## Experimente: o exemplo uart-avr

1. Novo Projeto ▸ **Co-design**, Começar por **Exemplo: uart-avr**, Concluir. O Sistema abre: `uno` (um Arduino Uno com
   `firmware/hello.hex`) ligado por `serial` a `fpga` (o módulo `uart` numa Basys2).
2. **Experimentar**, depois **Correr 100 ms**. No inspetor de ligações, `serial_uno` (o TX do Arduino para o RX da FPGA)
   mostra `Hello from Arduino!` e `serial_fpga` (o TX da FPGA de volta) o mesmo texto: a FPGA devolve cada byte.
3. **Ondas**: o D1 e o D0 do Arduino, o rx e o tx da FPGA, e os dois fios, ao longo dos 100 ms.

O código do firmware é `firmware/hello.asm`: envia a saudação e depois mostra no porto B cada byte que recebe.
