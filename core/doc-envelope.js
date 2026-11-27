// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Silinx's own documents (#5906, the architecture audit's 5.1, #5902): each kind by its file's name, with the `format`
// it carries when it writes one, the version this Silinx writes, the oldest it reads and its migrations. One envelope
// for all: a document is current (read as it is), older (read through its migrations, in memory: written in the new
// form on its next save, never on open; a version of the project kept before that save, core/doc-format.js
// migratingWrite), newer (a newer Silinx saved it: read only, never written back in the older form, #4756), too old (its
// reader refuses it: a System of version 1, #5488), damaged (not an object, or another kind's format) or with no version
// (read as version 1, the first, as every reader did). core/doc-format.js, the stores' guards, is built from it.
// Isomorphic, no imports: the numbers are the documents' own modules' (test/doc-envelope.test.js checks them).
//
// A migration, `migrate[n]`, takes a document of version n to version n + 1: small, pure (a new object), tested with
// a fixture of version n. A kind whose reader upgrades its own older versions says so (`upgradedBy`): the schematic's
// chain, core/schdoc.js normalizeDoc and core/schdoc-upgrade.js, needs the project's modules.

/** The documents, by kind: { type, re (its file's name), what (as the messages say it), version (the one written),
 *  oldest (the oldest read), format (the `format` field it carries, if any), migrate ({ n: doc -> doc }), upgradedBy }.
 *  `file: false`: not a project's file written by writeFile (silinx.json, the versions' index). */
export const DOCUMENTS = Object.freeze([
  { type: 'project', re: /(^|\/)silinx\.json$/i, what: 'project description', version: 1, file: false, migrate: {} },
  { type: 'schematic', re: /\.sch\.json$/i, what: 'schematic', version: 7, migrate: {}, upgradedBy: 'core/schdoc.js normalizeDoc' },
  { type: 'fsm', re: /\.fsm\.json$/i, what: 'state diagram', version: 1, migrate: {} },
  { type: 'asm', re: /\.asm\.json$/i, what: 'ASM chart', version: 1, migrate: {} },
  { type: 'truth-table', re: /\.(tt|bool)\.json$/i, what: 'truth table', version: 1, migrate: {} },
  { type: 'petri', re: /\.pn\.json$/i, what: 'Petri net', version: 1, migrate: {} },
  { type: 'circuit', re: /\.circ\.json$/i, what: 'circuit', version: 1, format: 'silinx-circuit', migrate: {} },
  { type: 'regmap', re: /\.regs\.json$/i, what: 'register map', version: 1, format: 'silinx-regmap', migrate: {} },
  { type: 'symbol', re: /\.sym\.json$/i, what: 'symbol', version: 1, migrate: {} },
  { type: 'system', re: /\.sys\.json$/i, what: 'System document', version: 2, oldest: 2, format: 'silinx-system', migrate: {} },
  { type: 'stimulus', re: /\.stim\.json$/i, what: 'stimulus file', version: 1, format: 'silinx-stimulus', migrate: {} },
  { type: 'versions', re: /(^|\/)\.silinx\/versions\/index\.json$/, what: 'versions index', version: 1, file: false, migrate: {} },
].map(d => Object.freeze(d)));

/** The kind of document at `path` (DOCUMENTS' entry), or null: not one of Silinx's documents. */
export const documentKind = path => DOCUMENTS.find(d => d.re.test(String(path ?? ''))) || null;

const nameOf = path => String(path).split('/').pop();
/** `what` with its article: a schematic, an ASM chart. */
export const an = what => `${/^(ASM|[aeiou])/i.test(what) ? 'an' : 'a'} ${what}`;
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** A document's version as written: a positive integer, or null (none, or not a number). */
export function versionField(doc) {
  if (!isObject(doc) || doc.version === undefined || doc.version === null || doc.version === '') return null;
  const n = +doc.version;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The document `doc` (parsed) at `path` checked: { kind, state, version (its own: 1 when it has none), message }, or
 *  null when `path` is not one of Silinx's documents. state: 'current', 'older' (read through its migrations; message:
 *  what its next save does), 'newer' (read only), 'too-old' (not read), 'missing' (no version: read as 1, older when the
 *  kind is past 1), 'damaged' (not an object, a version that is no number, another kind's format: not read). */
export function checkEnvelope(path, doc) {
  const kind = documentKind(path);
  if (!kind) return null;
  const name = nameOf(path);
  const out = (state, version, message = null) => ({ kind, state, version, message });
  if (!isObject(doc)) return out('damaged', null, `${name} is not ${an(kind.what)}: not a JSON object`);
  if (kind.format && doc.format !== undefined && doc.format !== kind.format) return out('damaged', null, `${name} is not ${an(kind.what)}: its format is '${String(doc.format).slice(0, 40)}', not '${kind.format}'`);
  const v = versionField(doc);
  if (v === null && doc.version !== undefined) return out('damaged', null, `${name} is not ${an(kind.what)} this Silinx reads: its version '${String(doc.version).slice(0, 20)}' is not a number`);
  const version = v ?? 1;
  if (version > kind.version) return out('newer', version, newerMessage(name, version, kind.version));
  if (version < (kind.oldest ?? 1)) return out('too-old', version, `${name} is ${an(kind.what)} of version ${version}: this Silinx reads versions ${kind.oldest} to ${kind.version}`);
  if (version < kind.version) return out('older', version, olderMessage(name, version, kind.version));
  return out(v === null ? 'missing' : 'current', version);
}

/** The message of a document a newer Silinx saved (#4756: its words, the interface's and the MCP's). */
export const newerMessage = (name, version, supported) => `${name} was saved by a newer Silinx (its format ${version}; this one reads up to ${supported}): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it`;
/** The message of a document in an older format (#5906): read in this Silinx's, written so on its next save. */
const olderMessage = (name, version, current) => `${name} is in an older format (${version}; this Silinx writes ${current}): it is read in the new one and written so on its next save, a version of the project kept first`;

/** The document `doc` at `path` taken to this Silinx's version through its migrations: { doc (a new object when
 *  migrated, else `doc` itself), from, to, steps (the versions it went through) }. A kind upgraded by its own reader
 *  (`upgradedBy`), a document not older, or not one of Silinx's: as it is (steps []). A migration missing in the chain
 *  throws: a bug, never a document read half-migrated. */
export function migrateDocument(path, doc) {
  const c = checkEnvelope(path, doc);
  if (!c || c.state !== 'older' || c.kind.upgradedBy) return { doc, from: c?.version ?? null, to: c?.version ?? null, steps: [] };
  return runMigrations(c.kind, doc, c.version, nameOf(path));
}

/** `doc` (of version `from`) taken through `kind`'s migrations to its version: { doc, from, to, steps }. Each step's
 *  result gets its version; the document given is never changed. */
export function runMigrations(kind, doc, from, name = kind.what) {
  let d = doc;
  const steps = [];
  for (let n = from; n < kind.version; n++) {
    const step = kind.migrate[n];
    if (typeof step !== 'function') throw new Error(`${name}: no migration of ${an(kind.what)} from version ${n} to ${n + 1}`);
    d = { ...step(structuredClone(d)), version: n + 1 };
    steps.push(n + 1);
  }
  return { doc: d, from, to: kind.version, steps };
}

/** Each kind's migrations checked: one for each version from its oldest to the one it writes, unless its reader
 *  upgrades it; [] when every chain is whole (test/doc-envelope.test.js). */
export function chainGaps() {
  const gaps = [];
  for (const k of DOCUMENTS) {
    if (k.upgradedBy) continue;
    for (let n = k.oldest ?? 1; n < k.version; n++) if (typeof k.migrate[n] !== 'function') gaps.push(`${k.type} ${n}→${n + 1}`);
  }
  return gaps;
}
