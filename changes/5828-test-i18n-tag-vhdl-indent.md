In detail:

- **Two repository-wide tests made right again after the nightly of 2026-11-27 (#5828, #5829):** the scan of web/js's
  template literals for a Portuguese translation reads a console line as the console draws it, its `ERROR:` / `WARNING:` /
  `INFO:` tag kept and the rest translated (#4998's warning of an I/O marker not renamed, translated in the app all
  along); the VHDL indentation test lists the adc-pmod example's continued selected assignments, aligned by hand as the
  other examples' continued statements are.
