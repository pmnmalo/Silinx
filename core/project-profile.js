// A project's profile (#5440, roadmap #5416's phase 4: every project a System): the node kinds its System allows, each
// profile containing the one before: Digital Logic ⊂ FPGA ⊂ Embedded / SoC ⊂ System. It replaces the project's kind.
// Read from today's silinx.json: a `profile` written by a profile change, else its kind (none: FPGA; 'design': Digital
// Logic; 'system': System); an FPGA or a design project untouched keeps its bytes. Widening allows more node kinds and
// converts nothing; narrowing is refused while a node of the project's System would not be allowed. Systems' profiles
// (Embedded / SoC, System) are off in a release (#5202). One set of rules and messages for the interface, the stores and
// the MCP server. Isomorphic module (browser + Node).
import { systemsOn, SYSTEMS_OFF } from './build-channel.js';

/** The profiles, narrowest first: id, label (the interface's), the node kinds a System of theirs may have. A design
 *  node: a design and simulation project's drawings (no board); a circuit: a breadboard's (#3897, #5215). */
export const PROFILES = [
  { id: 'logic', label: 'Digital Logic', nodes: ['design', 'circuit'] },
  { id: 'fpga', label: 'FPGA', nodes: ['design', 'circuit', 'fpga'] },
  { id: 'embedded', label: 'Embedded / SoC', nodes: ['design', 'circuit', 'fpga', 'mcu'] },
  { id: 'system', label: 'System', nodes: ['design', 'circuit', 'fpga', 'mcu', 'terminal'] },
];
const RANK = Object.fromEntries(PROFILES.map((p, i) => [p.id, i]));
/** A profile by its id, or null. */
export const profileById = id => PROFILES.find(p => p.id === id) || null;
/** Whether the profile `id` has a System document of its own (Embedded / SoC, System): its top a System. */
export const systemProfile = id => RANK[id] >= RANK.embedded;
/** Whether the profile `id` is offered in this build (a release: Digital Logic and FPGA only, #5202). */
export const profileOn = id => !!profileById(id) && (!systemProfile(id) || systemsOn());
/** The profiles offered in this build. */
export const offeredProfiles = () => PROFILES.filter(p => profileOn(p.id));

/** A project's profile (its silinx.json): its own, else its kind's (#5440: today's projects read as they are). */
export function profileOf(pj) {
  if (profileById(pj?.profile)) return pj.profile;
  return pj?.kind === 'design' ? 'logic' : pj?.kind === 'system' ? 'system' : 'fpga';
}

/** The project `pj` with the profile `id` written as it is kept: Digital Logic and FPGA as today (kind 'design', or no
 *  kind: an FPGA project back from another profile has its bytes again); Embedded / SoC and System their profile. */
export function withProfile(pj, id) {
  const out = { ...pj };
  delete out.profile;
  // (its kind kept in its place when it stays: a design project's silinx.json as it was)
  if (id === 'logic') { out.kind = 'design'; return out; }
  delete out.kind;
  return id === 'fpga' ? out : { ...out, profile: id };
}

/** Why the project `name` cannot take the profile `to`, its System's `nodes` as it would be ({ id, kind }), or null: no
 *  such profile, not in this build, or a node it does not allow (named). */
export function profileRefusal(name, to, nodes = []) {
  const p = profileById(to);
  if (!p) return `no profile '${to}' (the profiles: ${PROFILES.map(x => x.id).join(', ')})`;
  if (!profileOn(to)) return SYSTEMS_OFF;
  const out = nodes.filter(n => !p.nodes.includes(n.kind));
  if (!out.length) return null;
  const named = out.map(n => `${n.id} (${n.kind})`).join(', ');
  return `the project '${name}' cannot be ${p.label}: ${out.length > 1 ? 'its nodes' : 'its node'} ${named} ${out.length > 1 ? 'are' : 'is'} not allowed (${p.label} allows ${p.nodes.join(', ')})`;
}

/** What a profile change did, said (the interface's console and the MCP's result, #5440). */
export const profileChangedText = (name, to) => `${name}: ${profileById(to).label} now: its System may have ${profileById(to).nodes.join(', ')} nodes (nothing converted, nothing deleted).`;
/** What a profile change will do, said in Design Properties as it is chosen (#5440). */
export const profileNote = to => `Its System may have ${profileById(to).nodes.join(', ')} nodes: nothing converted, nothing deleted.`;

/** Whether going from the profile `from` to `to` narrows it. */
export const narrows = (from, to) => RANK[to] < RANK[from];
