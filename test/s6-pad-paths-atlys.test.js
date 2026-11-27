// #3152's flow on the Atlys's XC6SLX45: s6-pad-paths-lib.mjs (the Nexys3's and the pads' paths: s6-pad-paths.test.js, #5813).
import { PARTS, padFlowTests } from './s6-pad-paths-lib.mjs';

padFlowTests(PARTS.find(t => t.board === 'atlys'));
