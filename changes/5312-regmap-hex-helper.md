In detail:
- The register map's modules share one helper for an address's hex (core/regmap.js hexByte): core/regmap-c.js, core/regmap-hdl.js and web/js/regmap-editor.js each defined their own hex2 (#5288's register map), failing #1406's one-copy test on main; their output the same (#5312).
