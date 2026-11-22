// UI (#5284): at start-up the side panel shows the Start page from the first paint when no project is reopened: its
// Design page (the Design pane's old "No project open · New Project… · Open Project…", the Silinx interface's design bar,
// the ISE style's View and Processes) is never seen before the Start page replaces it. A project reopened at start-up
// is on its Design page; Close Project goes back to the Start page with nothing in the Design pane. The local server's
// edition and the browser edition's (the site); no warning, no error. (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';
import { buildSite } from './site-lib.js';

let env, site;
before(async () => {
  env = await setupUi();
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => env;
const S = () => (site?.skip ? { skip: site.skip } : env);

// (from the page's first script: the side panel's page seen at every change while the app is shown, and whether the
// Design pane's old empty state was ever there)
const WATCH = `window.__pages = []; window.__noProject = false;
  const note = () => {
    const app = document.getElementById('app');
    if (!app || getComputedStyle(app).visibility === 'hidden') return;
    const shown = [...document.querySelectorAll('#left-pages > .left-page')].filter((p) => p.getClientRects().length).map((p) => p.dataset.page).join('+');
    if (shown && window.__pages.at(-1) !== shown) window.__pages.push(shown);
    if (/No project open|New Project…/.test(document.getElementById('hier')?.textContent || '')) window.__noProject = true;
  };
  new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const frame = () => { note(); if (!window.__stopWatch) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);`;
const FORGET = () => { for (const s of [localStorage, sessionStorage]) for (const k of Object.keys(s)) if (/lastProject$/.test(k)) s.removeItem(k); };
const settle = (page) => page.eval(() => new Promise((r) => setTimeout(r, 400)));
const seen = (page) => page.eval(() => { window.__stopWatch = true; return { pages: window.__pages, noProject: window.__noProject }; });
const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#5284 start-up with no project: the Start page from the first paint, the Design page never seen', E, async (page) => {
  await page.setViewport(1366, 768);
  await page.eval(FORGET);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
  await page.reload();
  await page.waitFor(() => !document.querySelector('.left-page[data-page=start]').hidden && document.querySelector('#start-page .page'), [], { what: 'the Start page' });
  await settle(page);
  assert.deepEqual(await seen(page), { pages: ['start'], noProject: false });
  assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab.active')?.dataset.page), 'start');
  assert.equal(await page.eval(() => document.getElementById('hier').textContent), '', 'nothing in the Design pane');
  assert.deepEqual(await problems(page), []);
}, { skip: chromeOnly });

uiTest('#5284 a project reopened at start-up: on its Design page; Close Project: the Start page, the Design pane empty', E, async (page) => {
  await makeProject(env, { name: 'NoFlash', template: 'gates' });
  await page.setViewport(1366, 768);
  await page.openProject('NoFlash');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
  await page.reload();
  await page.waitFor(() => window.Silinx?.project?.name === 'NoFlash' && !document.documentElement.hasAttribute('data-starting') && document.querySelector('#hier .row'), [], { what: 'reopened', timeout: 30000 });
  await settle(page);
  assert.deepEqual(await seen(page), { pages: ['design'], noProject: false });
  assert.equal(await page.eval(() => document.querySelector('#left-tabs .tab.active')?.dataset.page), 'design');
  assert.deepEqual(await problems(page), []);
  // Close Project: the Start page, nothing left in the hidden Design pane (no empty state: the Start page's commands)
  await page.eval(() => window.SilinxApp.closeProject());
  await page.waitFor(() => window.Silinx.project === null && !document.querySelector('.left-page[data-page=start]').hidden, [], { what: 'closed' });
  assert.equal(await page.eval(() => document.querySelector('.left-page[data-page=design]').hidden), true);
  assert.equal(await page.eval(() => document.getElementById('hier').textContent), '');
  assert.deepEqual(await problems(page), []);
}, { skip: chromeOnly });

uiTest('#5284 browser edition: start-up with no project shows the Start page from the first paint', S, async (page) => {
  await page.setViewport(1366, 768);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && window.Silinx?.devices && document.querySelector('#start-page .page'), [], { what: 'site boot', timeout: 30000 });
  await settle(page);
  assert.deepEqual(await seen(page), { pages: ['start'], noProject: false });
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 120000 });
