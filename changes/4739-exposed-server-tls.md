In short:

- **A server for other computers over HTTPS:** `silinx serve --host 0.0.0.0` (or another address than this computer's)
  needs `--tls-cert` and `--tls-key`, or `--insecure-http` to accept plain HTTP, where its token would cross the
  network unencrypted.

In detail:

- **`serve` on another address than loopback: HTTPS, or plain HTTP said explicitly (#4739):** without a certificate
  (`--tls-cert <file.pem> --tls-key <file.pem>`, the server and its relay of shared projects then over HTTPS and WSS) or
  `--insecure-http`, it does not start and says why; with `--insecure-http` its warning says the token crosses the
  network unencrypted. SECURITY.md and docs/DEVELOPMENT.md say so.
- **A request a page of the same site made (`Sec-Fetch-Site: same-site`, another port or subdomain) is refused as
  another site's (#4739).**
