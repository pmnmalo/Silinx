// Silinx - a System's FPGA node's models (#5612, docs/SYSTEMS.md, Emulation): an FPGA node emulated on its RTL or on
// one of its flow's simulation models, as an FPGA project's Emulate is (#3704): Post-Synthesis, Post-Translate,
// Post-Map, Post-Place & Route, those its board's toolchain makes. A model is made by the node's own flow on its board
// (#5446: build/nodes/<id>/, its run's reports.json naming the model's file); the project's Emulation Properties choose
// each FPGA node's model for Emulate System (silinx.json's system.emulate.models: { id: model }; none: its RTL).
// Isomorphic module (browser + Node).
import { simModelsOf, toolOf } from './tool-descriptors.js';
import { nodeBoard } from './system-node.js';

/** The models' names, as Emulate's processes and the status line say them. */
export const MODEL_NAMES = { rtl: 'Behavioral (RTL)', postsynth: 'Post-Synthesis', posttrans: 'Post-Translate', postmap: 'Post-Map', postpar: 'Post-Place & Route' };

/** The models the FPGA node `n`'s board's toolchain makes (the Silinx toolchain's), in their flow's order. */
export function nodeModels(n) {
  const d = nodeBoard(n)?.device;
  return d ? simModelsOf(toolOf(d, true)) : [];
}

// each model's flow: the steps that make it
const STEPS = { postsynth: ['synth', 'postsynth'], posttrans: ['synth', 'translate', 'posttrans'], postmap: ['synth', 'translate', 'map', 'postmap'],
  postpar: ['synth', 'translate', 'map', 'par', 'postpar'] };
/** The steps of the node's flow that make the model `m`. */
export const modelSteps = m => STEPS[m] || [];

/** The path in the project of the FPGA node `id`'s model `m`, its build's reports (`reports`, its reports.json, read)
 *  say: the board's own (its design's generics, #622) when there is one; null when it has not been made. */
export function nodeModelFile(reports, id, m) {
  const s = reports?.simModels?.[m];
  const p = s?.board?.path || s?.path;
  return p ? `build/nodes/${id}/${p}` : null;
}

/** The path of the FPGA node `id`'s build's reports (its last run's). */
export const nodeReportsPath = id => `build/nodes/${id}/build/reports.json`;

/** Why the model `m` is no model of the FPGA node `n`, or null (rtl: always one). */
export function modelRefusal(n, m) {
  if (m === 'rtl' || m == null) return null;
  if (n?.kind !== 'fpga') return `${n?.id ?? '?'}: only an FPGA node has models`;
  const made = nodeModels(n);
  return made.includes(m) ? null : `${n.id}: no model '${m}' (its board's toolchain makes ${['rtl', ...made].join(', ')})`;
}

/** The project `pj`'s Emulation Properties' models for `sys`: { id: model } (its FPGA nodes' that are not their RTL). */
export function emulateModelsOf(pj, sys) {
  const given = pj?.system?.emulate?.models || {};
  return Object.fromEntries((sys?.nodes || []).filter(n => n.kind === 'fpga' && given[n.id] && given[n.id] !== 'rtl' && !modelRefusal(n, given[n.id])).map(n => [n.id, given[n.id]]));
}

/** The project `pj` with the FPGA nodes' models `models` ({ id: model | 'rtl' | null }: those given) for `sys`, or { error }. */
export function withEmulateModels(pj, sys, models) {
  const next = { ...(pj.system?.emulate?.models || {}) };
  for (const [id, m] of Object.entries(models)) {
    const n = sys.nodes.find(x => x.id === id);
    if (!n) return { error: `${id}: no such node in ${sys.name}` };
    const why = modelRefusal(n, m);
    if (why) return { error: why };
    if (m == null || m === 'rtl') delete next[id]; else next[id] = m;
  }
  const { emulate = {}, ...rest } = pj.system || {};
  const { models: _old, ...em } = emulate;
  const e2 = Object.keys(next).length ? { ...em, models: next } : em;
  const system = Object.keys(e2).length ? { ...rest, emulate: e2 } : rest;
  const out = { ...pj, system };
  if (!Object.keys(system).length) delete out.system;
  return out;
}
