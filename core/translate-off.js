// What synthesis does not read (#3901): the lines between `synthesis translate_off` and `synthesis translate_on` (also
// `pragma` and `synopsys`, in a VHDL `--` or a Verilog `//` comment), as XST skips them; the simulation reads them. The
// Silinx toolchain's front end (core/synth-front.js flowFrontEnd, web/js/implement.js) compiles the sources so: each
// such line blanked, the others kept where they are (the messages' line numbers the file's). A digital circuit's HDL
// (core/circuit-hdl.js) keeps its simulation's model there. Isomorphic module.

const PRAGMA = /(?:--|\/\/)\s*(?:synthesis|pragma|synopsys)\s+translate_(off|on)\b/i;

/** The text as synthesis reads it: the lines from a translate_off to its translate_on (both included) blanked. */
export function synthesisText(text) {
  const lines = String(text ?? '').split('\n');
  let off = false;
  return lines.map((l) => {
    const m = PRAGMA.exec(l);
    if (m) { const was = off; off = m[1].toLowerCase() === 'off'; return was || off ? '' : l; }
    return off ? '' : l;
  }).join('\n');
}

/** The HDL sources ([{ path, lang, text, … }]) as synthesis reads them: those with a translate_off, blanked so. */
export const synthesisSources = (srcs) => srcs.map((s) => (PRAGMA.test(String(s.text ?? '')) ? { ...s, text: synthesisText(s.text) } : s));
