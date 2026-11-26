// The page cross-origin isolated (#5648, core/cross-origin.js): its headers, and why a page is not isolated (a file, not
// a secure context, no headers), as the console says it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISOLATION_HEADERS, isolationProblem } from '../core/cross-origin.js';

test('#5648 the headers; why a page is not isolated', () => {
  assert.deepEqual(ISOLATION_HEADERS, { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
  assert.equal(isolationProblem({ crossOriginIsolated: true }), null);
  assert.equal(isolationProblem({ crossOriginIsolated: false, location: { protocol: 'file:' } }), 'the page is opened from a file, which cannot be cross-origin isolated: open the site or the local server');
  assert.equal(isolationProblem({ crossOriginIsolated: false, isSecureContext: false, location: { protocol: 'http:' } }), 'the page is not a secure context (https or localhost), which cannot be cross-origin isolated');
  assert.equal(isolationProblem({ crossOriginIsolated: false, isSecureContext: true, location: { protocol: 'https:' } }), 'the page is not cross-origin isolated: its server sent no Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy, or the browser refused them');
  assert.equal(isolationProblem({}), isolationProblem({ crossOriginIsolated: false }));
  // (the browser edition's first load: its service worker not controlling it yet)
  const site = c => ({ crossOriginIsolated: false, isSecureContext: true, location: { protocol: 'https:' }, navigator: { serviceWorker: { controller: c } }, document: { querySelector: s => (s === 'link[rel="manifest"]' ? {} : null) } });
  assert.equal(isolationProblem(site(null)), 'the page was loaded before its service worker made it cross-origin isolated: reload it');
  assert.equal(isolationProblem(site({})), 'the page is not cross-origin isolated: its server sent no Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy, or the browser refused them');
});
