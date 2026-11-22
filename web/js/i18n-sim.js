// Portuguese strings of the simulation's application lines (#5223): the Console's (the Test Bench Wizard's, Set as Top
// Module's) and SSim's own (its wave configuration, its forces, its runs, its stimuli, its VCD export: web/js/isim-*.js,
// logLine's app lines), drawn in the interface's language while their messages keep their English (merged into the
// dictionary of i18n.js). The simulator's output (the design's reports, the commands' answers) is never translated. A part
// of a message that is a message of its own (an error's text) is translated too, by t(), read when a text is translated.
import { t } from './i18n.js';

const plural = (n, one, many) => `${n} ${n === '1' ? one : many}`;

export const SIM_PT = {
  'Simulation has finished; use Restart.': 'A simulação terminou; use Reiniciar.',
  'Stimuli: the expected outputs filled in from the simulation': 'Estímulos: as saídas esperadas preenchidas a partir da simulação',
  'simulation has finished; the force takes effect after restart': 'a simulação terminou; o forçamento tem efeito depois de reiniciar',
};

export const SIM_PT_PATTERNS = [
  // the Test Bench Wizard's line (web/js/tbwizard.js)
  [/^Test Bench Wizard: created the test bench skeleton (\S+) for '(.+)' \(selected in the Simulation view\): write the stimulus, then Simulate Behavioral Model\.$/,
    "Assistente de Bancada de Teste: criou o esqueleto da bancada de teste $1 para '$2' (selecionada na vista Simulação): escreva os estímulos e depois Simular Modelo Comportamental."],
  [/^Test Bench Wizard: created (?:the test bench (\S+)|(\S+)) \((\d+) vector\(s\)\) for '(.+)' \(selected in the Simulation view\)\. Run Simulate Behavioral Model to check the design\.$/,
    (m, name, path, n, uut) => `Assistente de Bancada de Teste: criou ${name ? `a bancada de teste ${name}` : path} (${n} vetor(es)) para '${uut}' (selecionada na vista Simulação). Execute Simular Modelo Comportamental para verificar o projeto.`],
  // Set as Top Module's line (web/js/design.js setTop)
  [/^Top-level simulation module set to '(.+)'\.$/, "Módulo de topo da simulação definido como '$1'."],
  [/^Top-level module set to '(.+)'\.$/, "Módulo de topo definido como '$1'."],
  // the wave configuration (web/js/isim-wcfg.js)
  [/^Wave configuration saved to (\S+)$/, 'Configuração de formas de onda guardada em $1'],
  [/^Wave configuration (.+) loaded: (\d+) signals?, (\d+) markers?$/, (m, f, n, k) => `Configuração de formas de onda ${f === 'the wave configuration' ? '' : `${f} `}carregada: ${plural(n, 'sinal', 'sinais')}, ${plural(k, 'marcador', 'marcadores')}`],
  [/^(\S+) is not a signal of this design: not shown$/, '$1 não é um sinal deste projeto: não mostrado'],
  [/^the wave configuration was not (saved|loaded): ([\s\S]*)$/, (m, w, e) => `a configuração de formas de onda não foi ${w === 'saved' ? 'guardada' : 'carregada'}: ${t(e)}`],
  // the forces (web/js/isim-api.js, isim-forces.js)
  [/^(\d+) force\(s\) re-applied\.$/, '$1 forçamento(s) aplicado(s) de novo.'],
  [/^Force removed from (\S+)$/, 'Forçamento removido de $1'],
  // the runs (web/js/isim-run.js)
  [/^Command '(.+)' cancelled \(Break\)$/, "Comando '$1' cancelado (Parar)"],
  [/^Simulation has already finished \((.+)\); use Restart to run again\.$/, 'A simulação já terminou ($1); use Reiniciar para a executar de novo.'],
  [/^internal simulator error: ([\s\S]*)$/, (m, e) => `erro interno do simulador: ${t(e)}`],
  [/^Simulation interrupted \(Break\) at (.+)$/, 'Simulação interrompida (Parar) em $1'],
  [/^Simulation stopped: no more events scheduled \(time (.+)\)$/, 'Simulação parada: não há mais eventos agendados (tempo $1)'],
  [/^Run All stopped at the (.+) limit \(time (.+)\)$/, 'Executar Tudo parado no limite de $1 (tempo $2)'],
  [/^Stepped to (.+)$/, 'Avançou para $1'],
  [/^invalid run time '(.*)'$/, "tempo de execução inválido '$1'"],
  // the stimuli (web/js/isim-stimuli.js)
  [/^Stimuli: (\d+) cycles, the expected outputs match$/, 'Estímulos: $1 ciclos, as saídas esperadas coincidem'],
  [/^Stimuli: (\d+) mismatch\(es\) of the expected outputs$/, 'Estímulos: $1 diferença(s) nas saídas esperadas'],
  [/^(\S+) at cycle (\d+) \((.+)\): expected (\S+), got (\S+)$/, '$1 no ciclo $2 ($3): esperado $4, obtido $5'],
  // the VCD export (web/js/isim-api.js)
  [/^Waveform exported to (\S+) \(([\d.]+) KB\)$/, 'Formas de onda exportadas para $1 ($2 KB)'],
  [/^VCD export failed: ([\s\S]*)$/, (m, e) => `a exportação VCD falhou: ${t(e)}`],
];
