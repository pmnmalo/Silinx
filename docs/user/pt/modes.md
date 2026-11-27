# Modos de projeto: Circuito, Placa, Sistema

[Guia do utilizador](README.md) · [English](../en/modes.md) · Português

Cada projeto do Silinx está num de três **modos**, cada um um passo à frente do anterior. O **Novo Projeto…** (New
Project…) pergunta primeiro o modo, com três cartões, e um projeto pode mudar de modo depois com **Projeto ▸ Mudar o
Modo…** (Project ▸ Change Mode…).

| Modo | Para que serve | O que mostra |
|---|---|---|
| **Circuito** (Circuit) | Componentes elementares sem placa: portas, flip-flops, circuitos numa breadboard, esquemáticos, tabelas de verdade, máquinas de estados, fluxogramas ASM, redes de Petri, desenhados e simulados. | Os seus desenhos e a sua simulação. Sem placa, sem restrições, sem síntese nem implementação, e sem HDL à vista (cada desenho continua a fazer o seu HDL, escondido). |
| **Placa** (Board) | Exatamente uma placa, com o seu fluxo, o seu emulador e a sua programação. A placa é uma placa FPGA (o projeto sintetizado, implementado e programado num bitstream) ou uma placa de processador: um Arduino Uno ou Nano, a Explorer 16/32 (PIC24), um Raspberry Pi Pico ou Pico W, um ESP32 DevKitC (o seu firmware compilado e executado). | Uma placa FPGA: as fontes, as restrições e todo o fluxo, o Emulador da Placa. Uma placa de processador: o seu firmware e o Emular, Simular e Programar da placa. |
| **Sistema** (System) | Vários dispositivos ligados por UART, SPI, I²C ou Pmods: placas FPGA, microcontroladores, um terminal série, circuitos. | O seu documento de Sistema (os nós e as suas ligações, desenhados), os ficheiros de cada nó na sua pasta, e a simulação e a emulação do Sistema (ver [Sistemas](systems.md)). |

## Começar um projeto

- **Circuito**: um projeto vazio (o seu topo um desenho: um esquemático, uma máquina de estados, uma tabela de verdade,
  um circuito…), ou um dos exemplos de Circuito, criados sem placa: **gates** (portas lógicas desenhadas num
  esquemático), **breadboard** (chips 74LS ligados numa breadboard), e as versões de Circuito de quatro exemplos FPGA,
  só desenhos, cada uma com uma bancada de teste que a verifica: **traffic-circuit** (o diagrama de estados da
  passadeira e a tabela de verdade das luzes, o seu temporizador um contador da paleta), **blinky-circuit** (um knight
  rider: um contador, portas XOR e um descodificador), **stopwatch-circuit** (dois contadores de décadas, cada um um
  contador e um comparador, começados e parados por um flip-flop T) e **lock-circuit** (a fechadura de combinação: um
  diagrama de estados, uma tabela de verdade, um fluxograma ASM, uma rede de Petri e um 74LS175 numa breadboard).
- **Placa**: o seu cartão pergunta o **Tipo de Placa** (Board Type), FPGA, Arduino, PIC24, Raspberry Pi Pico ou ESP32,
  e a página das definições lista as placas desse tipo. Uma placa FPGA faz o projeto FPGA de todas as versões anteriores
  (vazio ou a partir de qualquer exemplo FPGA, blinky, pong, uart…). Uma placa de processador não precisa de nenhum
  campo da FPGA, e o projeto começa com um firmware que faz piscar o LED da placa (um programa em assembly para um Arduino, um em MicroPython ou CircuitPython
  para um Pico, em MicroPython para um ESP32; o PIC24 começa sem nenhum: o seu `.hex` é do MPLAB X). Selecione a linha
  da placa no painel Design para o seu **Emular Nó** (Emulate Node), **Simular Nó** (Simulate Node) e **Programar Nó**
  (Program Node).
- **Sistema**: um Sistema vazio, ou um exemplo de Sistema (uart-avr, spi-avr, i2c-avr, regs-avr, uart-pic24, adc-pmod,
  uart-pico, uart-esp32, uart-zynq).

Os Sistemas, e com eles as placas de processador, estão na versão de desenvolvimento até estarem estáveis.

## Mudar de modo

**Projeto ▸ Mudar o Modo…** mostra os três cartões, o do projeto marcado. Escolha outro e o diálogo diz o que a mudança
faz antes de fazer alguma coisa:

- **Subir não perde nada.** Um projeto de Circuito a que se dá uma placa passa a projeto de Placa (o seu ficheiro de
  restrições escrito a partir dos pinos da placa). Um projeto de Placa passa a Sistema: a sua placa é o primeiro nó do
  Sistema, os seus ficheiros vão para a pasta do nó (`fpga/`: um Sistema constrói cada nó a partir da sua pasta) e o seu
  documento de Sistema é escrito. Acrescente-lhe os outros dispositivos no editor de Sistema.
- **Descer é permitido, com um aviso** que diz cada coisa perdida: um Sistema que desce a Placa fica com um dos seus nós
  FPGA ou de microcontrolador (a primeira FPGA, ou o escolhido) e perde os outros e as ligações; uma Placa que desce a
  Circuito perde a sua placa, o seu ficheiro de restrições e as fontes HDL que nenhum desenho faz. Cada perda é também
  um aviso na consola.

Nada é apagado: o que sai do projeto fica na sua pasta no disco, e uma versão do projeto é guardada mesmo antes da
mudança (**Projeto ▸ Versões…** restaura-a). Uma ida e volta Placa → Sistema → Placa devolve a mesma placa, o mesmo
módulo de topo e as mesmas restrições.

O firmware de uma placa de processador não é um desenho, por isso o seu projeto não desce a Circuito.

## Projetos feitos antes dos modos

Abrem como estão, sem nada para converter: um projeto de desenho e simulação ("Lógica Digital") é um projeto de
Circuito, um projeto FPGA um projeto de Placa, um projeto Embebido / SoC ou de Sistema um projeto de Sistema. Os seus
ficheiros não são tocados. A afinação de um Sistema, Embebido / SoC ou Sistema (os tipos de nós que permite), continua
nas **Propriedades do Projeto** (Design Properties).

## Para um assistente de IA

O servidor MCP faz o mesmo ([O Silinx para um assistente de IA](ai-mcp.md)): o `new_project` recebe `mode` (`circuit`,
`board`, `system`) e uma placa de processador como `board`; o `new_project_from_example` recebe `mode circuit` para um
exemplo de Circuito; o `list_examples` dá os modos de cada exemplo; o `set_design_properties` com `mode` muda o modo de um projeto, uma descida
só com `confirm`, a recusa a dizer o que se perderia; o `project_info` e o `list_projects` dão o modo de cada projeto.
