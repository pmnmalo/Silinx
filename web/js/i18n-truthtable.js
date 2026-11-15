// Portuguese strings of the Boolean Algebra / Karnaugh Map tool (merged into the dictionary of i18n.js).
export const TT_PT = {
  // menus, processes, New Source
  'Boolean Algebra / Karnaugh Map…': 'Álgebra Booleana / Mapa de Karnaugh…', 'Boolean Algebra / Karnaugh Map': 'Álgebra Booleana / Mapa de Karnaugh',
  'Boolean Algebra': 'Álgebra Booleana', 'View/Edit Boolean Algebra': 'Ver/Editar Álgebra Booleana',
  'Open Boolean Algebra': 'Abrir Álgebra Booleana',
  'Algebra from Module': 'Álgebra de um Módulo',
  'Combinational module (at most 8 input bits): its truth table is computed by simulating every input combination.':
    'Módulo combinatório (no máximo 8 bits de entrada): a tabela de verdade é calculada simulando todas as combinações das entradas.',
  'The project has no design modules.': 'O projeto não tem módulos de projeto.',
  // editor toolbar
  'Inputs:': 'Entradas:', 'Outputs:': 'Saídas:',
  'Output names (1 or more), separated by commas or spaces': 'Nomes das saídas (1 ou mais), separados por vírgulas ou espaços',
  'The logic of this output: its module and its schematic in this form': 'A lógica desta saída: o seu módulo e o seu esquemático nesta forma',
  'The HDL logic of this output: its module and its schematic in this form': 'A lógica do HDL desta saída: o seu módulo e o seu esquemático nesta forma',
  'Least number of gates': 'Menor número de portas', 'Least delay': 'Menor atraso',
  // the maps in 3D (#1407)
  'Reset view': 'Repor a vista', 'Drag (or the arrow keys) to turn the maps': 'Arraste (ou use as setas) para rodar os mapas',
  'The maps stacked in depth: a group across maps seen as one box': 'Os mapas empilhados em profundidade: um grupo que atravessa mapas visto como uma só caixa',
  // the maps of 3 and 4 variables on a cylinder and a torus (#2925)
  'The map rolled into a cylinder: the cells across its edges joined': 'O mapa enrolado num cilindro: as células de um lado e do outro das margens juntas',
  'The map on a torus: both pairs of its edges joined': 'O mapa num toro: os dois pares de margens juntos',
  'Drag (or the arrow keys) to turn the map': 'Arraste (ou use as setas) para rodar o mapa',
  'The form with the fewest gates, each symbol one gate whatever its number of inputs': 'A forma com menos portas, cada símbolo uma porta qualquer que seja o seu número de entradas',
  'The form with the fewest gates on its longest path, every gate the same delay': 'A forma com menos portas no caminho mais longo, todas as portas com o mesmo atraso',
  'Algebra from Module…': 'Álgebra de um Módulo…', 'Fill the table': 'Preencher a tabela',
  'Fill the table with the truth table of a combinational module of the project (exhaustive simulation)': 'Preencher a tabela com a tabela de verdade de um módulo combinatório do projeto (simulação exaustiva)',
  'Not in sync with': 'Não sincronizado com',
  // editor body
  'Truth table': 'Tabela de verdade', 'Notes': 'Notas', 'Notes (saved with the table)': 'Notas (guardadas com a tabela)',
  'Click an output cell to change it: 0 → 1 → X (don\'t care).': 'Clique numa célula de saída para a mudar: 0 → 1 → X (indiferente).',
  'Select this output': 'Selecionar esta saída', 'Expression': 'Expressão', 'Fill Table': 'Preencher Tabela',
  'Fill the column of this output from the expression': 'Preencher a coluna desta saída a partir da expressão',
  'Karnaugh map': 'Mapa de Karnaugh', 'SOP groups (1s)': 'Grupos SdP (1s)', 'POS groups (0s)': 'Grupos PdS (0s)',
  // the variables' order on the map (#2924)
  'Order:': 'Ordem:', 'Order of the variables on the map, from the most significant to the least': 'Ordem das variáveis no mapa, da mais significativa para a menos',
  'MSB → LSB by columns, then rows': 'MSB → LSB pelas colunas, depois linhas', 'MSB → LSB by rows, then columns': 'MSB → LSB pelas linhas, depois colunas',
  'Results': 'Resultados', 'e.g. /a.b + c': 'p.ex. /a.b + c',
  "Operators: / ' ~ (NOT), . · * (AND), ⊕ ^ or xor (XOR), xnor, + (OR)": "Operadores: / ' ~ (NOT), . · * (AND), ⊕ ^ ou xor (XOR), xnor, + (OR)",
  'XOR form': 'Forma XOR',
  'Shown when it has fewer literals than the minimal SOP and POS, or as many and fewer operators': 'Mostrada quando tem menos literais do que a SdP e o PdS mínimos, ou tantos e menos operadores',
  'The search was cut short: a simpler XOR form may exist.': 'A procura foi interrompida: pode existir uma forma XOR mais simples.',
  // the NAND and NOR forms, the schematic of a table (#694)
  'NAND form': 'Forma NAND', 'NOR form': 'Forma NOR',
  'The minimal SOP with NAND gates only (double negation); an inverter is a NAND with its inputs tied, /(a·a)': 'A SdP mínima só com portas NAND (dupla negação); um inversor é uma NAND com as entradas ligadas, /(a·a)',
  'The minimal POS with NOR gates only (double negation); an inverter is a NOR with its inputs tied, /(a + a)': 'O PdS mínimo só com portas NOR (dupla negação); um inversor é uma NOR com as entradas ligadas, /(a + a)',
  'Generated from the Boolean algebra, in its HDL logic form': 'Gerado a partir da álgebra booleana, na sua forma da lógica do HDL',
  'Canonical SOP': 'Forma canónica SdP', 'Canonical POS': 'Forma canónica PdS',
  'The sum of the minterms: every input in every term, the don\'t cares left out': 'A soma dos mintermos: todas as entradas em todos os termos, sem as indiferenças',
  'The product of the maxterms: every input in every term, the don\'t cares left out': 'O produto dos maxtermos: todas as entradas em todos os termos, sem as indiferenças',
  'No 1s: no groups (the output is always 0).': 'Sem 1s: sem grupos (a saída é sempre 0).',
  'No 0s: no groups (the output is always 1).': 'Sem 0s: sem grupos (a saída é sempre 1).',
  'At least 1 output': 'Pelo menos 1 saída',
  'Many minimal solutions exist; the first 64 can be browsed.': 'Existem muitas soluções mínimas; podem ver-se as primeiras 64.',
  'Previous solution': 'Solução anterior', 'Next solution': 'Solução seguinte',
  // the K-map's and Quine-McCluskey's results (#3939), the table's notation in its ⋮ menu
  'Karnaugh map SOP': 'SdP do mapa de Karnaugh', 'Karnaugh map POS': 'PdS do mapa de Karnaugh', 'Quine-McCluskey SOP': 'SdP de Quine-McCluskey', 'Quine-McCluskey POS': 'PdS de Quine-McCluskey',
  'The function simplified on the Karnaugh map: its groups of 1s (SOP) or of 0s (POS)': 'A função simplificada no mapa de Karnaugh: os seus grupos de 1s (SdP) ou de 0s (PdS)',
  SOP: 'SdP', POS: 'PdS',
  'The simplified function as a sum of products (its 1s)': 'A função simplificada como soma de produtos (os seus 1s)',
  'The simplified function as a product of sums (its 0s)': 'A função simplificada como produto de somas (os seus 0s)',
  'The function simplified by the Quine-McCluskey algorithm': 'A função simplificada pelo algoritmo de Quine-McCluskey',
  Steps: 'Passos', 'Show the steps of the algorithm': 'Mostrar os passos do algoritmo',
  'Prime implicants, column by column': 'Implicantes primos, coluna a coluna', 'Prime implicants of the 0s, column by column': 'Implicantes primos dos 0s, coluna a coluna',
  'Prime implicant chart': 'Tabela de implicantes primos', 'Essential prime implicants': 'Implicantes primos essenciais', None: 'Nenhum',
  'Cover: each minterm left grown into a prime implicant, the redundant ones dropped': 'Cobertura: cada mintermo em falta alargado a um implicante primo, retirados os redundantes',
  "Cover: the essential prime implicants, then the fewest others that cover the rest (Petrick's method)": 'Cobertura: os implicantes primos essenciais, depois o menor número de outros que cobre o resto (método de Petrick)',
  'Fill the table, its notation': 'Preencher a tabela, a sua notação', Notation: 'Notação', 'As in the Settings': 'Como nas Definições',
  'The notation of Settings ▸ Boolean Notation': 'A notação de Definições ▸ Notação Booleana', "The notation of this table's expressions": 'A notação das expressões desta tabela',
};

export const TT_PT_PATTERNS = [
  [/^Input names \(1 to (\d+)\), separated by commas or spaces; the first is the most significant bit of a row$/, 'Nomes das entradas (1 a $1), separados por vírgulas ou espaços; a primeira é o bit mais significativo de cada linha'],   // (#3939)
  [/^1 to (\d+) inputs$/, '1 a $1 entradas'],
  // the table's notation in its ⋮ menu (a notation's name: the Settings', i18n.js; #3939)
  [/^(Electronics \/ Engineering|Text only|Logic \/ Set theory|VHDL|Verilog): (.+)$/, (m, n, ex) => `${{ 'Electronics / Engineering': 'Eletrónica / Engenharia', 'Text only': 'Só texto', 'Logic / Set theory': 'Lógica / Teoria de conjuntos' }[n] || n}: ${ex}`],
  [/^\(shown in part: (\d+) literal\(s\) in all\)$/, '(mostrada em parte: $1 literal(is) ao todo)'],   // (a large table's long expression, #3939)
  // the console's notes (#3939)
  [/^(.+): no Karnaugh map for more than (\d+) inputs \(it has (\d+)\): the simplified function is Quine-McCluskey's\.$/, "$1: sem mapa de Karnaugh para mais de $2 entradas (tem $3): a função simplificada é a de Quine-McCluskey."],
  [/^WARNING: (.+): (.+): the Karnaugh map's (SOP|POS): the exact search was cut short: this solution may not be minimal\.$/, (m, t, o, k) => `AVISO: ${t}: ${o}: ${k === 'SOP' ? 'a SdP' : 'o PdS'} do mapa de Karnaugh: a procura exata foi interrompida: esta solução pode não ser mínima.`],
  [/^WARNING: (.+): (.+): Quine-McCluskey's (SOP|POS) is not proven minimal \((too many implicants: a cover heuristic|the search for the cover was bounded)\)\.$/,
    (m, t, o, k, why) => `AVISO: ${t}: ${o}: ${k === 'SOP' ? 'a SdP' : 'o PdS'} de Quine-McCluskey não está provad${k === 'SOP' ? 'a' : 'o'} mínim${k === 'SOP' ? 'a' : 'o'} (${why.startsWith('too') ? 'demasiados implicantes: uma heurística de cobertura' : 'a procura da cobertura foi limitada'}).`],
  [/^As a circuit: (\d+) gate\(s\), delay (\d+)$/, 'Como circuito: $1 porta(s), atraso $2'],   // (#1427)
  [/^(\d+) term\(s\), (\d+) literal\(s\); gates: (\d+) AND, (\d+) OR, (\d+) NOT \((\d+) gate inputs\)$/, '$1 termo(s), $2 literal(is); portas: $3 AND, $4 OR, $5 NOT ($6 entradas de portas)'],
  [/^(\d+) literal\(s\), (\d+) two-input operator\(s\): (\d+) XOR \/ XNOR, (\d+) AND, (\d+) OR$/, '$1 literal(is), $2 operador(es) de duas entradas: $3 XOR / XNOR, $4 AND, $5 OR'],
  [/^(\d+) minimal solutions exist\.$/, (m, k) => `Existem ${k} soluções mínimas.`],
  [/^Solution (\d+) of (\d+)$/, (m, i, k) => `Solução ${i} de ${k}`],
  [/^\((\d+) prime implicant\(s\)\)$/, '($1 implicante(s) primo(s))'],
  [/^(\d+) gate\(s\), (\d+) of them inverter\(s\)$/, '$1 porta(s), $2 delas inversora(s)'],
  [/^— the truth table has errors: (.+)$/, '— a tabela de verdade tem erros: $1'],
  [/^— (.+) has errors$/, '— $1 tem erros'],
  // the status line (#2763)
  [/^(\d+) inputs? · (\d+) outputs? · (\d+) rows$/, (m, i, o, r) => `${i} entrada${i === '1' ? '' : 's'} · ${o} saída${o === '1' ? '' : 's'} · ${r} linhas`],
];
