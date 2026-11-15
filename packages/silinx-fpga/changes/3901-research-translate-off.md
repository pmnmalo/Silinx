In detail:

- **The research flow reads what synthesis reads (#3901):** `research/s3e-route/open-flow.mjs`, the build the "yosys
  update" workflow measures each example with, blanks the lines between `synthesis translate_off` and `translate_on`, as
  the application's front end does (`core/translate-off.js`): a digital circuit's simulation model is not synthesised (the
  breadboard example: 4 slices, as the application builds it, not none).
