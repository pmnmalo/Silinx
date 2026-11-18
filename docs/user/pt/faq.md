# Perguntas e respostas

[Guia do utilizador](README.md) · [English](../en/faq.md) · Português

**Preciso de instalar alguma coisa?** Não: https://pmnmalo.github.io/Silinx/ faz tudo no browser, do projeto até à
programação da placa. Instalá-lo ([Começar](getting-started.md), forma 2) acrescenta os projetos em pastas, o Xilinx
ISE e o AMD Vivado, e as ferramentas de programação instaladas.

**Preciso do Xilinx ISE?** Não para as placas Basys2, Nexys2, Nexys3, Atlys, iCEBreaker, ULX3S, Tang Nano 9K e GateMate de avaliação: as
ferramentas do Silinx implementam para elas. O ISE 14.7 acrescenta as outras placas das suas famílias. Veja
[Placas e ferramentas](boards.md).

**Onde ficam os meus projetos?** No browser, a não ser que escolha uma pasta do disco (*Ficheiro ▸ Abrir Pasta de
Trabalho…*, no Chrome e no Edge). Com o Silinx a correr no seu computador, em `Silinx-projects`, na sua pasta de
utilizador. *Ficheiro ▸ Exportar Projeto (.zip)…* faz uma cópia.

**Funciona num iPad ou num tablet?** Sim: os editores, a simulação, o emulador e o bitstream. O Chrome num tablet
Android também programa a placa; um iPad não chega aos dispositivos USB.

**Posso abrir os meus projetos do ISE?** Sim: *Importar Projeto…* aceita um projeto do ISE (o seu `.xise`, ou um zip),
também os seus esquemáticos.

**O que é que o Silinx envia pela Internet?** O site conta as visitas e o que é usado (um projeto novo, uma simulação,
um bitstream) com o GoatCounter: sem cookies, sem dados pessoais, nunca o conteúdo de um projeto. A aplicação instalada
e o `Silinx.html` descarregado não enviam nada. Os pormenores:
[as funcionalidades](../en/features.md#privacy-and-usage-counts) (em inglês).

**Alguma coisa não funciona.** Diga-nos no [GitHub](https://github.com/pmnmalo/Silinx/issues): o que fez, o que
esperava e o que aconteceu. Usa o Silinx numa cadeira? Diga-nos também, nas
[GitHub Discussions](https://github.com/pmnmalo/Silinx/discussions/151).

**É gratuito?** Sim: software livre, com a licença AGPL-3.0. Os seus projetos, e o HDL que o Silinx gera para eles,
são seus.
