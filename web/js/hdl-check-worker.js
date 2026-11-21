// The check of an HDL file as one types, off the page's thread (#4773, web/js/hdl-check-client.js): core/hdl-check.js,
// the project's parses kept here from one check to the next (core/compile.js), so that a key typed parses its file only.
import { hdlCheck } from '/core/hdl-check.js';

self.onmessage = ({ data: { id, job } }) => {
  let out;
  try { out = { id, ...hdlCheck(job) }; } catch (e) { out = { id, error: e.message }; }
  self.postMessage(out);
};
