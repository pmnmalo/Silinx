// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A page of the local server reloaded under its policy with 'unsafe-eval' added (#4845), as the published editions' policy
// has it for their Blob workers (server/csp.js evalInWorkers, #4741): for a test of code that only workers, or the
// published editions, evaluate (the compiled simulator's code, nextpnr's bundle run from its files in memory), run in a
// page of the app. The local server's own pages evaluate no code. Chrome's DevTools Protocol: the documents' response
// headers rewritten (Fetch: the response fulfilled again, continueResponse's headers did not reach the page's policy), for
// this page alone.

/** `page` (test/ui/harness.js's Chrome page) reloaded with 'unsafe-eval' in its script-src; resolves once booted. */
export async function withEvalPolicy(page) {
  page.cdp.on((msg) => {
    if (msg.method !== 'Fetch.requestPaused' || msg.sessionId !== page.sessionId) return;
    const { requestId, responseStatusCode, responseHeaders = [] } = msg.params;
    const headers = responseHeaders.map((h) => (/^content-security-policy$/i.test(h.name) ? { name: h.name, value: h.value.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'") } : h));
    page.send('Fetch.getResponseBody', { requestId })
      .then(({ body, base64Encoded }) => page.send('Fetch.fulfillRequest', { requestId, responseCode: responseStatusCode, responseHeaders: headers, body: base64Encoded ? body : Buffer.from(body).toString('base64') }))
      .catch(() => page.send('Fetch.continueRequest', { requestId }).catch(() => {}));
  });
  await page.send('Fetch.enable', { patterns: [{ resourceType: 'Document', requestStage: 'Response' }] });
  const url = await page.eval(() => location.href);
  await page.goto(url);
  await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot (with eval)' });
}
