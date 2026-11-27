// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// silinx.json's migrations (#5907, core/doc-envelope.js's chain for the project description): each takes a description
// of version n to n + 1, small and pure (a new object), with no imports (the registry's). Version 2: what a project is
// written once, as its profile (core/project-profile.js: logic, fpga, embedded, system; its mode, core/project-mode.js,
// derived from it as before), never as the old `kind` ('design': Digital Logic; 'system': System; none: FPGA) beside it;
// `files` a list.

const PROFILES = ['logic', 'fpga', 'embedded', 'system'];

/** A description of version 1 as version 2: its profile written (its own, else its kind's), its kind gone, its files a
 *  list. */
export function projectV1toV2(pj) {
  const out = { ...pj };
  const profile = PROFILES.includes(out.profile) ? out.profile : out.kind === 'design' ? 'logic' : out.kind === 'system' ? 'system' : 'fpga';
  delete out.kind;
  out.profile = profile;
  if (!Array.isArray(out.files)) out.files = [];
  return out;
}
