// The ISE project routes (#405: server/xise-routes.js out of registerImplRoutes in server/impl-routes.js): mounted
// alone they register the .xise export / import / sync and the zip export / import, in that order; registerImplRoutes
// registers them among its own, where they were (the routes themselves: test/server-api.test.js, test/server.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountXiseRoutes } from '../server/xise-routes.js';
import { registerImplRoutes } from '../server/impl-routes.js';

// an api that records what is registered on it: "method path"
function recorder() {
  const calls = [];
  const api = new Proxy({}, { get: (_, m) => (...a) => { calls.push(`${String(m)} ${[].concat(a.find(x => typeof x === 'string' || Array.isArray(x))).join(' ')}`); return api; } });   // (a route's names: its new and older ones, #4754)
  return { api, calls };
}
const projects = { HttpError: class extends Error {} };

test('#405 ISE project routes: mounted alone, the .xise and zip routes', () => {
  const { api, calls } = recorder();
  mountXiseRoutes({ P: projects, api, wrap: f => f, bad: m => new Error(m) });
  assert.deepEqual(calls, ['get /projects/:p/export.xise', 'post /import-xise /projects/import-xise', 'get /projects/:p/export.zip', 'post /import-zip /projects/import-zip', 'post /projects/:p/sync-xise']);
});

test('#405 ISE project routes: registerImplRoutes registers them after its own, then Merge Contribution\'s (#4206), the versions\' (#5740), then KiCad\'s libraries\' (#4285)', () => {
  const { api, calls } = recorder();
  registerImplRoutes(api, { wrap: f => f, projects });
  assert.equal(calls.length, 43);   // (a Zynq's PS program compiled and run, #4687; the project's versions' five, #5740, #5741; program's and prom's with the project in the address, #4754; an Arduino node's firmware, #5503; a System's build plan and build, its connected boards, its program plan and programming, #5489)
  assert.ok(calls.includes('get /projects/:p/build-plan') && calls.includes('post /projects/:p/build'), 'a System\'s build plan and Build All (#5489)');
  assert.ok(calls.includes('post /projects/:p/ps') && calls.includes('post /projects/:p/ps-run'), 'a Zynq\'s PS program compiled and run (#4687)');
  assert.ok(calls.includes('post /projects/:p/capture'), 'the capture of the logic analyzer (#3176)');
  assert.deepEqual(calls.slice(-17, -12), ['get /projects/:p/export.xise', 'post /import-xise /projects/import-xise', 'get /projects/:p/export.zip', 'post /import-zip /projects/import-zip', 'post /projects/:p/sync-xise']);
  assert.deepEqual(calls.slice(-12, -9), ['post /projects/:p/merge-preview', 'post /projects/:p/merge', 'post /projects/:p/undo-merge']);
  // the project's versions (#5740)
  assert.deepEqual(calls.slice(-9, -4), ['get /projects/:p/versions', 'post /projects/:p/versions', 'get /projects/:p/versions/:id', 'get /projects/:p/versions/:id/diff', 'post /projects/:p/versions/:id/restore']);
  // then Browse KiCad Libraries…'s (#4285) and the KiCad catalogue's (#4305)
  assert.deepEqual(calls.slice(-4), ['get /kicad/libraries', 'get /kicad/libraries/:id', 'post /projects/:p/kicad/catalogue', 'post /projects/:p/kicad/import']);
});
