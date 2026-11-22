// Portuguese strings of the FSM, ASM, Petri net, UCF and Boolean Algebra wizards of New Source (#2082, #2140, #2149:
// web/js/chart-wizards.js, template-page.js, ucf-wizard.js, tt-wizard.js, core/chart-templates.js; merged into the
// dictionary of i18n.js); a project's name and Replace Project (New Project's, the imports', #3538); Rename Project… (#4641).
export const WIZARDS_PT = {
  // the browser edition's first run: a workspace folder offered (#4962, web/js/storage-offer.js)
  'Choose a Workspace Folder…': 'Escolher uma Pasta de Trabalho…', 'Keep in This Browser': 'Manter Neste Navegador',
  'Projects in This Browser': 'Projetos Neste Navegador', 'Move…': 'Mover…', 'Not Now': 'Agora Não',
  'Delete from This Browser': 'Apagar Deste Navegador', 'Keep Them': 'Mantê-los',
  // the back-up reminder's button (#4971, web/js/backup-reminder.js)
  'Export Project (.zip)': 'Exportar Projeto (.zip)',
  'Wizard >': 'Assistente >',   // New Source's button (#958, #2082)
  'Damaged: silinx.json cannot be read': 'Danificado: o silinx.json não pode ser lido',   // (Open Project's damaged project, #4755)
  'Read-only, saved by a newer Silinx': 'Só de leitura, guardado por um Silinx mais recente',   // (a drawing a newer Silinx saved, #4756)
  // a design and simulation project (#3780: New Project's Project Kind, Design Properties' board list)
  'Project Kind:': 'Tipo de Projeto:',
  'Design and simulation only (no FPGA)': 'Só desenho e simulação (sem FPGA)', 'Digital Logic': 'Lógica Digital', 'Check Design of the selected module': 'Verificar Projeto do módulo selecionado',
  // New Project's first page, the project's kind (#5041, web/js/project-kind-step.js, core/project-kind.js)
  'Project Kind': 'Tipo de Projeto', 'Choose the kind of project to create.': 'Escolha o tipo de projeto a criar.',
  'FPGA': 'FPGA', 'Co-design': 'Co-design',   // (Digital Logic: above, #5133)
  'Digital logic for the introductory courses: schematics, truth tables, state machines and circuits on a breadboard, drawn and simulated.':
    'Lógica digital para as disciplinas introdutórias: esquemáticos, tabelas de verdade, máquinas de estados e circuitos numa breadboard, desenhados e simulados.',
  'A design that runs on a board: HDL sources and drawings, simulated, synthesized, implemented and programmed on the FPGA, or emulated.':
    'Um projeto que corre numa placa: fontes HDL e desenhos, simulados, sintetizados, implementados e programados na FPGA, ou emulados.',
  'A system of FPGA and microcontroller nodes linked together, designed and simulated as one.':
    'Um sistema de nós de FPGA e de microcontrolador ligados entre si, desenhado e simulado como um todo.',
  // Design Properties' Project Kind, what a change of kind does (#5041, core/project-kind.js DESIGN_ONLY_MESSAGES)
  'Co-design (New Project only)': 'Co-design (só em Novo Projeto)',
  // (co-design not in a release yet, #5202: core/build-channel.js)
  "Co-design is not in this release yet: it is in the development build (the site's dev/) until it is stable.": 'O co-design ainda não está nesta versão: está na versão de desenvolvimento (a dev/ do site) até estar estável.',
  'Its board and its constraints file leave the project (the file stays on the disk); its drawings stay, their HDL and the test benches hidden, none deleted.':
    'A placa e o ficheiro de restrições saem do projeto (o ficheiro fica no disco); os desenhos ficam, o seu HDL e as bancadas de teste escondidos, nada apagado.',
  'Its HDL and the FPGA flow are shown, nothing lost: choose its board or its device.':
    'O HDL e o fluxo da FPGA passam a ver-se, nada se perde: escolha a placa ou o dispositivo.',
  'A co-design project has no board of its own: each FPGA node of its System names its board and pins, each microcontroller its firmware.':
    'Um projeto de co-design não tem placa própria: cada nó FPGA do seu Sistema indica a sua placa e os pinos, cada microcontrolador o seu firmware.',
  'Replace Project': 'Substituir Projeto',   // (New Project's and the imports', #3538)
  // Rename Project… (#4641)
  'Rename Project…': 'Mudar o Nome do Projeto…', 'Rename Project': 'Mudar o Nome do Projeto',
  'A letter, then letters, digits, - and _. The project stays open; its folder is renamed.': 'Uma letra, depois letras, dígitos, - e _. O projeto continua aberto; a pasta muda de nome.',
  // the FSM and ASM wizards
  'FSM Wizard': 'Assistente de FSM', 'ASM Wizard': 'Assistente de ASM',
  'State machine (module) name:': 'Nome da máquina de estados (módulo):', 'ASM chart (module) name:': 'Nome do diagrama ASM (módulo):',
  'The wizard creates a state diagram with its inputs, outputs, states and transitions, ready for you to set the outputs of its states; its HDL is generated from it.':
    'O assistente cria um diagrama de estados com as entradas, as saídas, os estados e as transições, pronto para definir as saídas dos estados; o HDL é gerado a partir dele.',
  'The wizard creates an ASM chart with its inputs, outputs and state boxes, ready for you to add the decisions and the outputs; its HDL is generated from it.':
    'O assistente cria um diagrama ASM com as entradas, as saídas e as caixas de estado, pronto para acrescentar as decisões e as saídas; o HDL é gerado a partir dele.',
  'The wizard creates a state diagram with its inputs, outputs, states and transitions, ready for you to set the outputs of its states.':
    'O assistente cria um diagrama de estados com as entradas, as saídas, os estados e as transições, pronto para definir as saídas dos estados.',
  'The wizard creates an ASM chart with its inputs, outputs and state boxes, ready for you to add the decisions and the outputs.':
    'O assistente cria um diagrama ASM com as entradas, as saídas e as caixas de estado, pronto para acrescentar as decisões e as saídas.',
  'Reset (asynchronous, to the initial state):': 'Reset (assíncrono, para o estado inicial):',
  'Machine type:': 'Tipo de máquina:',
  'States and Transitions': 'Estados e Transições', 'States': 'Estados', '(initial)': '(inicial)',
  'Add State': 'Acrescentar Estado', 'Add Transition': 'Acrescentar Transição', 'Empty: always': 'Vazia: sempre', 'always': 'sempre',
  'No transitions yet: use Add Transition, or draw them in the editor.': 'Ainda sem transições: use Acrescentar Transição, ou desenhe-as no editor.',
  'The states (the first one is the initial state, after the reset), then the transitions between them: a condition over the inputs (e.g. x, !x, a && b, n == 3), empty for always; the first true one of a state is taken.':
    'Os estados (o primeiro é o estado inicial, depois do reset), e depois as transições entre eles: uma condição sobre as entradas (p. ex. x, !x, a && b, n == 3), vazia para sempre; é tomada a primeira verdadeira de cada estado.',
  'One state box per state, top to bottom: the first one is the initial state (after the reset); each one goes to the next, the last one back to the first. Add the decision boxes and the outputs in the editor.':
    'Uma caixa de estado por estado, de cima para baixo: a primeira é o estado inicial (depois do reset); cada uma vai para a seguinte, a última volta à primeira. Acrescente as caixas de decisão e as saídas no editor.',
  'Add at least one state.': 'Acrescente pelo menos um estado.',
  'A transition starts or ends at a state that is not in the list.': 'Uma transição começa ou acaba num estado que não está na lista.',
  // the Boolean Algebra Wizard (#2140, web/js/tt-wizard.js)
  'Boolean Algebra Wizard': 'Assistente de Álgebra Booleana', 'Outputs: at least one.': 'Saídas: pelo menos uma.',
  // the templates of the FSM, ASM and Petri net wizards (#2149, web/js/template-page.js, core/chart-templates.js)
  'Template': 'Modelo', 'Template:': 'Modelo:', 'Start from a template: it fills in the next pages, where you can still change everything.':
    'Comece por um modelo: ele preenche as páginas seguintes, onde ainda pode mudar tudo.',
  'Empty': 'Vazio', 'Counter': 'Contador', 'Up/down counter': 'Contador crescente/decrescente', 'Counter with enable': 'Contador com enable',
  'Ring counter': 'Contador em anel', 'Johnson counter': 'Contador Johnson', 'Sequence detector': 'Detetor de sequência', 'Traffic light': 'Semáforo de trânsito',
  'Start/done controller': 'Controlador start/done', 'Request/acknowledge handshake': 'Handshake pedido/confirmação',
  'Cycle of N places': 'Ciclo de N lugares', 'Producer/consumer': 'Produtor/consumidor', 'Mutual exclusion': 'Exclusão mútua', 'Fork/join': 'Fork/join',
  'Semaphore': 'Semáforo',
  // the Schematic Wizard's (#2180, core/chart-templates.js SCH_TEMPLATES, core/sch-templates.js)
  'Register': 'Registo', 'Shift register': 'Registo de deslocamento', 'Modulo-N counter': 'Contador módulo N', 'Clock divider (tick)': 'Divisor de relógio (tick)', 'PWM': 'PWM',
  'Edge detector': 'Detetor de flanco', 'Synchroniser and debouncer': 'Sincronizador e debouncer', 'Adder-subtractor': 'Somador-subtrator', 'Accumulator': 'Acumulador',
  'Multiplexed 7-segment display': 'Display de 7 segmentos multiplexado', 'Full adder (gates)': 'Somador completo (portas)',
  'Width (bits):': 'Largura (bits):', 'Clock enable:': 'Enable do relógio:', 'Reset:': 'Reset:', 'Direction:': 'Sentido:', 'Modulus (N):': 'Módulo (N):', 'Divide by (N):': 'Dividir por (N):', 'Edge:': 'Flanco:', 'rising': 'ascendente', 'falling': 'descendente', 'both': 'ambos',
  'Clocks between samples (N):': 'Relógios entre amostras (N):', 'Digits:': 'Dígitos:', 'Clocks per digit (N):': 'Relógios por dígito (N):', '2': '2', '4': '4', 'yes': 'sim', 'no': 'não', 'up': 'crescente', 'down': 'decrescente',
  'No symbols: only the I/O markers of the inputs and outputs you type in.': 'Sem símbolos: só os marcadores de E/S das entradas e saídas que escrever.',
  'N flip-flops side by side: q takes d at the rising edge of clk, while ce = 1; rst sets it to 0.': 'N flip-flops lado a lado: q toma o valor de d no flanco ascendente de clk, enquanto ce = 1; rst põe-no a 0.',
  'N flip-flops in a chain: at the rising edge of clk, q moves one place to the left and its bit 0 takes the serial input si.': 'N flip-flops em cadeia: no flanco ascendente de clk, q desloca-se uma posição para a esquerda e o seu bit 0 toma o valor da entrada série si.',
  'A binary counter of N bits: q counts at the rising edge of clk, while ce = 1; rst sets it to 0.': 'Um contador binário de N bits: q conta no flanco ascendente de clk, enquanto ce = 1; rst põe-no a 0.',
  'A counter and a comparator: when q reaches N-1, the comparator clears the counter at the next count, so q goes 0 to N-1; tc marks the last count, to chain another counter.': 'Um contador e um comparador: quando q chega a N-1, o comparador repõe o contador a zero na contagem seguinte, e q vai de 0 a N-1; tc assinala a última contagem, para encadear outro contador.',
  'A counter and a comparator give tick, 1 for one clock period in every N: connect it to a clock enable, rather than making another clock.': 'Um contador e um comparador dão tick, a 1 durante um período de relógio em cada N: ligue-o a um enable do relógio, em vez de criar outro relógio.',
  'A free counter compared with the duty kept in a register (load = 1 takes it): pwm is 1 for duty clocks in every 2^N, to dim an LED.': 'Um contador livre comparado com o duty guardado num registo (load = 1 toma-o): pwm fica a 1 durante duty relógios em cada 2^N, para regular o brilho de um LED.',
  'A flip-flop keeps the input of one clock ago and a gate compares it with the present one: pulse is 1 for one clock period at each edge of d.': 'Um flip-flop guarda a entrada de há um relógio e uma porta compara-a com a atual: pulse fica a 1 durante um período de relógio em cada flanco de d.',
  "For a button: two flip-flops bring d into the clock's domain, and a third one samples it once every N clocks, longer than the bouncing lasts; q is the clean input.": 'Para um botão: dois flip-flops trazem d para o domínio do relógio e um terceiro amostra-o uma vez em cada N relógios, mais tempo do que duram os ressaltos; q é a entrada limpa.',
  'One adder for both: sub = 1 chooses the complement of b and adds 1 through the carry in, so s = a - b; ov says that the signed result does not fit.': 'Um só somador para as duas operações: sub = 1 escolhe o complemento de b e soma 1 pelo transporte de entrada, e s = a - b; ov indica que o resultado com sinal não cabe.',
  'An adder and a register in a loop: at each rising edge of clk, while ce = 1, q takes q + d; rst sets it to 0.': 'Um somador e um registo em ciclo: em cada flanco ascendente de clk, enquanto ce = 1, q toma o valor de q + d; rst põe-no a 0.',
  'The digits of d shown one at a time, too fast to see: a tick every N clocks moves a counter, which chooses the digit and lights its anode; a multiplexer of constants gives its segments. seg (gfedcba) and an are active low.': 'Os dígitos de d mostrados um de cada vez, depressa demais para se notar: um tick em cada N relógios faz avançar um contador, que escolhe o dígito e acende o seu ânodo; um multiplexador de constantes dá os seus segmentos. seg (gfedcba) e an são ativos a 0.',
  'One bit added with XOR, AND and OR gates: s = a xor b xor ci, co = a and b, or (a xor b) and ci.': 'Um bit somado com portas XOR, AND e OR: s = a xor b xor ci, co = a and b, ou (a xor b) and ci.',
  'Number of states (N):': 'Número de estados (N):', 'Number of states (N, even):': 'Número de estados (N, par):', 'Number of places (N):': 'Número de lugares (N):',
  'Buffer size (N):': 'Tamanho do buffer (N):', 'Resources (N):': 'Recursos (N):', 'Users (M):': 'Utilizadores (M):', 'Pattern (bits or regular expression):': 'Padrão (bits ou expressão regular):',
  'Overlapping matches:': 'Ocorrências sobrepostas:', 'yes (1011011: two)': 'sim (1011011: duas)', 'no (1011011: one)': 'não (1011011: uma)',
  'Moore (the output on a state)': 'Moore (a saída num estado)', 'Mealy (the output on a transition)': 'Mealy (a saída numa transição)',
  'No inputs or outputs, two states: type in your own.': 'Sem entradas nem saídas, dois estados: escreva os seus.',
  'N states in a cycle, one at each clock edge; the output q is the count (0 to N-1).': 'N estados em ciclo, um a cada flanco do relógio; a saída q é a contagem (0 a N-1).',
  'N states in a cycle: up = 1 counts up, up = 0 counts down; the output q is the count.': 'N estados em ciclo: up = 1 conta para cima, up = 0 para baixo; a saída q é a contagem.',
  'N states in a cycle: it counts while en = 1 and stays while en = 0; the output q is the count.': 'N estados em ciclo: conta enquanto en = 1 e fica enquanto en = 0; a saída q é a contagem.',
  'N states in a cycle, the output q one-hot: one bit set, moving one place at each clock edge.': 'N estados em ciclo, a saída q one-hot: um bit a 1, que avança uma posição a cada flanco do relógio.',
  'N states (an even number) in a cycle, the output q of N/2 bits a twisted ring: 000, 001, 011, 111, 110, 100…': 'N estados (um número par) em ciclo, a saída q de N/2 bits um anel torcido: 000, 001, 011, 111, 110, 100…',
  'The input x read one bit at each clock edge; the output z is 1 when the last bits read are the pattern: bits (1011) or a regular expression over 0 and 1, with . or [01] any bit, ( ), |, *, +, ?, {n}, {n,m} (1(01)*1, 10+1, 110|101).':
    'A entrada x lida um bit a cada flanco do relógio; a saída z é 1 quando os últimos bits lidos são o padrão: bits (1011) ou uma expressão regular sobre 0 e 1, com . ou [01] qualquer bit, ( ), |, *, +, ?, {n}, {n,m} (1(01)*1, 10+1, 110|101).',
  'Green, yellow, red in turn, each until the input t (its time is up) is 1; the outputs green, yellow and red light the lamps.': 'Verde, amarelo, vermelho à vez, cada um até a entrada t (o seu tempo acabou) ser 1; as saídas green, yellow e red acendem as lâmpadas.',
  'No inputs or outputs, two state boxes chained: add your own.': 'Sem entradas nem saídas, duas caixas de estado encadeadas: acrescente as suas.',
  'N state boxes chained in a cycle, each one setting the output q to its count.': 'N caixas de estado encadeadas em ciclo, cada uma a pôr na saída q a sua contagem.',
  'N state boxes in a cycle, a decision on up after each: up = 1 to the next, up = 0 to the previous; q is the count.': 'N caixas de estado em ciclo, uma decisão sobre up depois de cada uma: up = 1 para a seguinte, up = 0 para a anterior; q é a contagem.',
  'IDLE (ready) waits for start, RUN (busy) waits for done, FINISH (ready) goes back to IDLE.': 'IDLE (ready) espera por start, RUN (busy) espera por done, FINISH (ready) volta a IDLE.',
  'IDLE waits for req; ACK sets ack while req stays 1, then back to IDLE.': 'IDLE espera por req; ACK põe ack a 1 enquanto req fica a 1, depois volta a IDLE.',
  'No places yet: draw your own.': 'Ainda sem lugares: desenhe os seus.',
  'N places in a ring, one token going round: a transition fires while go = 1; the output q is the number of the marked place.': 'N lugares em anel, uma marca a dar a volta: uma transição dispara enquanto go = 1; a saída q é o número do lugar marcado.',
  'A buffer of N items: produce (put = 1) takes a free slot, consume (get = 1) gives it back; can_put and has_data say whether there is room and data.': 'Um buffer de N itens: produce (put = 1) ocupa uma posição livre, consume (get = 1) devolve-a; can_put e has_data dizem se há espaço e dados.',
  'Two processes share one token: req1 / req2 ask for it, grant1 / grant2 say who has it; never both.': 'Dois processos partilham uma marca: req1 / req2 pedem-na, grant1 / grant2 dizem quem a tem; nunca os dois.',
  'go splits the token into two branches, each going on with its input (a, b); they join again when both are done.': 'go divide a marca em dois ramos, cada um a avançar com a sua entrada (a, b); voltam a juntar-se quando ambos acabam.',
  'M users share N resources: req takes one (if any is free), rel gives one back; active while some user has one.': 'M utilizadores partilham N recursos: req toma um (se houver livre), rel devolve um; active enquanto algum utilizador tiver um.',
  // the sequence detector's pattern refused (core/regex-automata.js, core/seq-detector.js, #4902; those with a position: WIZARDS_PT_PATTERNS)
  'Pattern: a bit string (1011) or a regular expression over 0 and 1 (1(01)*1).': 'Padrão: uma sequência de bits (1011) ou uma expressão regular sobre 0 e 1 (1(01)*1).',
  'Pattern: an empty alternative before the end.': 'Padrão: uma alternativa vazia antes do fim.',
  'Pattern: it matches no bit string.': 'Padrão: não corresponde a nenhuma sequência de bits.',
  'Pattern: it matches the empty string (no bits), so z would always be 1: make every match at least one bit long.':
    'Padrão: corresponde à sequência vazia (sem bits), e z seria sempre 1: faça cada correspondência ter pelo menos um bit.',
  'Pattern: too big: its automaton would have too many states.': 'Padrão: demasiado grande: o autómato teria estados a mais.',
  'A Johnson counter has an even number of states.': 'Um contador Johnson tem um número par de estados.',
  "The template's state boxes, the first one the initial state (after the reset): rename them here; change the chart in the editor.":
    'As caixas de estado do modelo, a primeira o estado inicial (depois do reset): mude-lhes o nome aqui; mude o diagrama no editor.',
  // the UCF Wizard
  'UCF Wizard': 'Assistente de UCF', 'Ports and Pins': 'Portos e Pinos', 'Signal': 'Sinal', 'Pin': 'Pino', 'Module:': 'Módulo:',
  'Assign from Board': 'Atribuir pela Placa', 'e.g. P4': 'p. ex. P4', 'The project has no design module.': 'O projeto não tem módulos de desenho.',
  'No board selected (Project ▸ Design Properties): type the package pin of each bit of the module\'s ports.':
    'Nenhuma placa escolhida (Projeto ▸ Propriedades do Desenho): escreva o pino do encapsulamento de cada bit dos portos do módulo.',
};

// a parameter's label in a message (its field's, without the colon)
const label = what => (WIZARDS_PT[`${what}:`] || `${what}:`).replace(/:$/, '');

export const WIZARDS_PT_PATTERNS = [
  // (the browser edition's first run, #4962)
  [/^This browser's storage has (\d+) project\(s\): (.*)\. Copy them into the folder '(.*)'\? Move… copies them, then deletes them from this browser's storage once you confirm\.$/,
    "O armazenamento deste navegador tem $1 projeto(s): $2. Copiá-los para a pasta '$3'? Mover… copia-os e depois apaga-os do armazenamento deste navegador, depois de confirmar."],
  [/^Delete (\d+) project\(s\) from this browser's storage: (.*)\? They are now in the folder '(.*)'; this cannot be undone\.$/,
    "Apagar $1 projeto(s) do armazenamento deste navegador: $2? Estão agora na pasta '$3'; não se pode desfazer."],
  // a document a newer Silinx saved (core/doc-format.js, #4756)
  [/^(.+) was saved by a newer Silinx \(its format (\d+); this one reads up to (\d+)\): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it$/, '$1 foi guardado por um Silinx mais recente (o seu formato $2; este lê até ao $3): aberto só de leitura, para não ser guardado no formato antigo nem perder nada: atualize o Silinx para o alterar'],
  [/^the project was saved by a newer Silinx \(its format (\d+); this one reads up to (\d+)\): what that Silinx added to it may be lost when it is saved here: update Silinx$/, 'o projeto foi guardado por um Silinx mais recente (o seu formato $1; este lê até ao $2): o que esse Silinx lhe acrescentou pode perder-se ao guardá-lo aqui: atualize o Silinx'],
  [/^'(.+)' was saved by a newer Silinx \(its format (\d+); this one writes (\d+)\): not written in the older format, which would lose what that Silinx added: update Silinx to change it$/, "'$1' foi guardado por um Silinx mais recente (o seu formato $2; este escreve o $3): não escrito no formato antigo, que perderia o que esse Silinx acrescentou: atualize o Silinx para o alterar"],
  // a design and simulation project's refusals (core/project-kind.js, the MCP server's too, #3780)
  [/^(.*): a design and simulation project has drawings only: choose a board in Design Properties to add HDL sources$/, '$1: um projeto só de desenho e simulação tem apenas desenhos: escolha uma placa nas Propriedades do Desenho para acrescentar fontes HDL'],
  [/^(.*): a design and simulation project does not show its HDL \(its drawings are its sources\)$/, '$1: um projeto só de desenho e simulação não mostra o HDL (as fontes são os desenhos)'],
  [/^the project '(.*)' is a design and simulation project \(no FPGA\): choose a board in Design Properties to implement, emulate or program it$/, "o projeto '$1' é só de desenho e simulação (sem FPGA): escolha uma placa nas Propriedades do Desenho para o implementar, emular ou programar"],
  [/^the project '(.*)' cannot become a design and simulation project: its HDL and C sources are not drawings \((.*)\)$/, "o projeto '$1' não pode passar a só desenho e simulação: as fontes HDL e C não são desenhos ($2)"],
  // a project's name (core/project-name.js: the New Project wizard's, the imports', the server's, #3538)
  [/^invalid project name '(.*)': a letter, then up to 63 letters, digits, - and _$/, "nome de projeto inválido '$1': uma letra, depois até 63 letras, dígitos, - e _"],
  [/^A project named '(.*)' already exists: choose another name\.$/, "Já existe um projeto chamado '$1': escolha outro nome."],
  // Rename Project… (core/project-rename.js, #4641)
  [/^'(.*)' is the project's name already$/, "'$1' já é o nome do projeto"],
  [/^A project named '(.*)' already exists\.\n\nReplace it\? The existing project will be deleted from this browser\.$/, "Já existe um projeto chamado '$1'.\n\nSubstituí-lo? O projeto existente será apagado deste browser."],
  [/^A project named '(.*)' already exists\.\n\nReplace it\? The existing project is moved to the workspace \.trash folder\.$/, "Já existe um projeto chamado '$1'.\n\nSubstituí-lo? O projeto existente é movido para a pasta .trash da pasta de trabalho."],
  [/^The template's port '(.*)' was removed: put it back, or choose another template or parameters on the Template page\.$/, "O porto '$1' do modelo foi removido: reponha-o, ou escolha outro modelo ou outros parâmetros na página Modelo."],
  [/^The port '(.*)' is wired by the template, with its direction and width: change them on the Template page, or in the schematic editor after creating it\.$/, "O porto '$1' é ligado pelo modelo, com a sua direção e largura: altere-as na página Modelo, ou no editor de esquemáticos depois de o criar."],
  // the sequence detector's pattern refused at a position (core/regex-automata.js, #4902)
  [/^Pattern: '(.)' at position (\d+): not a bit \(0, 1\) nor one of \. \[ \] \( \) \| \* \+ \? \{ \}\.$/, "Padrão: '$1' na posição $2: não é um bit (0, 1) nem um de . [ ] ( ) | * + ? { }."],
  [/^Pattern: '(.)' at position (\d+) without its ([()])\.$/, "Padrão: '$1' na posição $2 sem o seu $3."],
  [/^Pattern: '\(' at position (\d+): an empty group\.$/, "Padrão: '(' na posição $1: um grupo vazio."],
  [/^Pattern: nothing before '(.)' at position (\d+) to repeat\.$/, "Padrão: nada antes de '$1' na posição $2 para repetir."],
  [/^Pattern: an empty alternative before '(.)' at position (\d+)\.$/, "Padrão: uma alternativa vazia antes de '$1' na posição $2."],
  [/^Pattern: '\[' at position (\d+): \[ \] holds the bits it allows, 0, 1 or both, then \]\.$/, "Padrão: '[' na posição $1: [ ] contém os bits que admite, 0, 1 ou ambos, e depois ]."],
  [/^Pattern: '\{' at position (\d+): \{n\}, \{n,\} or \{n,m\}, whole numbers from 0 to (\d+), n ≤ m\.$/, "Padrão: '{' na posição $1: {n}, {n,} ou {n,m}, números inteiros de 0 a $2, n ≤ m."],
  [/^Pattern: at most (\d+) characters\.$/, 'Padrão: no máximo $1 carateres.'],
  [/^Pattern: its detector would have (\d+) states, more than (\d+)\.$/, 'Padrão: o detetor teria $1 estados, mais de $2.'],
  [/^(.*): a whole number from (-?\d+) to (-?\d+)\.$/, (m, what, lo, hi) => `${label(what)}: um número inteiro de ${lo} a ${hi}.`],
  [/^(.*): choose one\.$/, (m, what) => `${label(what)}: escolha um.`],
  [/^The names of the inputs \(1 to (\d+)\) and of the outputs, separated by commas; or an expression, whose variables are the inputs and whose name \(else f\) the output, its column filled in\.$/,
    'Os nomes das entradas (1 a $1) e das saídas, separados por vírgulas; ou uma expressão, cujas variáveis são as entradas e cujo nome (senão f) é a saída, com a coluna preenchida.'],
  [/^Inputs: 1 to (\d+) \(there are (\d+)\)\.$/, 'Entradas: 1 a $1 (há $2).'], [/^'(.*)' is not a valid name\.$/, "'$1' não é um nome válido."],
  [/^'(.*)' is used twice\.$/, "'$1' é usado duas vezes."],
  [/^State '(.*)': (.*)\.$/, "Estado '$1': $2."], [/^Two states are named '(.*)'\.$/, "Há dois estados com o nome '$1'."],
  [/^Each bit of the module's ports on a pin of the (.*): assigned from the board by their names \(clk, led, sw, btn…\) and directions; change them at will\.$/,
    'Cada bit dos portos do módulo num pino da $1: atribuído pela placa pelos nomes (clk, led, sw, btn…) e pelas direções; mude-os à vontade.'],
  // (a Petri net's places and transitions too, core/petri.js validatePetri, #5185)
  [/^'(.*)' is used twice \((the clock|the reset|input|output|place|transition) and (the clock|the reset|input|output|place|transition)\)$/, (m, n, a, b) => {
    const W = { 'the clock': 'o relógio', 'the reset': 'o reset', input: 'entrada', output: 'saída', place: 'lugar', transition: 'transição' };
    return `'${n}' é usado duas vezes (${W[a]} e ${W[b]})`;
  }],
  [/^Not assigned: (.*)\.$/, 'Por atribuir: $1.'], [/^The pin (\S+) is given to (\S+) and (\S+)\.$/, 'O pino $1 está dado a $2 e a $3.'],
  [/^The wizard will create (\S+), the project's constraints file:$/, 'O assistente vai criar $1, o ficheiro de restrições do projeto:'],
  [/^The wizard will create (\S+):$/, 'O assistente vai criar $1:'],
  // the other families' constraints wizards (#2296): their names, their refusals (core/constraints-wizard.js)
  [/^(PCF|LPF|CST|CCF|XDC) Wizard$/, 'Assistente de $1'],
  [/^(set_io|LOCATE COMP|IO_LOC) (\S+): (\S+) is not a pin of the (\S+) package \(1…(\d+)\)\.$/, '$1 $2: $3 não é um pino do encapsulamento $4 (1…$5).'],
  [/^(set_io|LOCATE COMP|IO_LOC) (\S+): (\S+) is not a pin of the (\S+) package \(its balls look like A1, B12, AA3\)\.$/, '$1 $2: $3 não é um pino do encapsulamento $4 (as suas esferas são como A1, B12, AA3).'],
  [/^IO_TYPE=(\S+) of (\S+): the pin (\S+) \((\S+)\) is in a bank at ([\d.]+) V on the (.+) \((\S+)\), not ([\d.]+) V\.$/, 'IO_TYPE=$1 de $2: o pino $3 ($4) está num banco a $5 V na $6 ($7), não a $8 V.'],
];
