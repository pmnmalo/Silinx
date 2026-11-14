In detail:

- **The schematic editor's demo page loads again (#4011):** the Properties panel (web/js/sch-props.js) loads the console
  only when its Width field reports an error, since #3950's static import pulled in the app and CodeMirror, which
  sch-editor-demo.html does not have (test/ui/demo-pages.test.js).
