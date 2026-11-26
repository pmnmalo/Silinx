// An Arduino node's program compiled (#5503, core/avr-compile.js): the nodes compiled and those refused, the node's
// sketch (its main .ino, its sources, the .hex it makes), gcc's messages as the console's lines (its context, its quoted
// line and its notes left out; the linker's; once each), a sketch copy's paths as the project's, and a console line's
// location in an .ino (core/message-location.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVR_FQBN, compilerMessages, firmwareRefusal, firmwareSources, nodeSketch, sketchFileOf } from '../core/avr-compile.js';
import { messageLocation, projectPath } from '../core/message-location.js';

const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', lang: 'c', firmware: null };

test('#5503 the nodes compiled: an Uno\'s and a Nano\'s C or C++; the others refused, said why', () => {
  assert.equal(firmwareRefusal(UNO), null);
  assert.equal(firmwareRefusal({ ...UNO, board: 'arduino-nano', lang: 'cpp' }), null);
  assert.deepEqual(AVR_FQBN, { 'arduino-uno': 'arduino:avr:uno', 'arduino-nano': 'arduino:avr:nano:cpu=atmega328' });
  assert.equal(firmwareRefusal({ id: 'fpga', kind: 'fpga' }), 'fpga: a firmware is compiled for a microcontroller node (this one is fpga)');
  assert.equal(firmwareRefusal({ ...UNO, id: 'pic', board: 'explorer-1632' }), null, 'a PIC24\'s by XC16 (#5482)');
  assert.equal(firmwareRefusal({ ...UNO, board: 'esp32' }), 'uno: no compiler for its board esp32');
  assert.equal(firmwareRefusal({ ...UNO, lang: 'micropython' }), 'uno: a MicroPython node\'s program is not compiled (it runs as it is, #5487)');
});

const FILES = ['uart_avr.sys.json', 'fpga/uart.vhd', 'uno/hello.asm', 'uno/hello.hex', 'uno/blink.ino', 'uno/util.cpp', 'uno/util.h',
  'uno/lib/ring.c', 'uno/notes.txt', 'uno/build/x.c', 'uno2/other.ino', 'top.ino'];

test('#5503 the node\'s sources: its folder\'s .ino, C and C++ (a subfolder\'s too), sorted; another node\'s, the project\'s and a build folder\'s not', () => {
  assert.deepEqual(firmwareSources(FILES, 'uno'), ['uno/blink.ino', 'uno/lib/ring.c', 'uno/util.cpp', 'uno/util.h']);
  assert.deepEqual(firmwareSources(FILES, 'uno2'), ['uno2/other.ino']);
  assert.deepEqual(firmwareSources(FILES, 'fpga'), []);
});

test('#5503 the node\'s sketch: its main .ino, its .hex (the firmware\'s when a .hex, else <id>/<sketch>.hex); none, an error', () => {
  assert.deepEqual(nodeSketch(UNO, FILES), { name: 'blink', main: 'uno/blink.ino', sources: firmwareSources(FILES, 'uno'), hex: 'uno/blink.hex' });
  assert.equal(nodeSketch({ ...UNO, firmware: 'uno/hello.hex' }, FILES).hex, 'uno/hello.hex', 'the node\'s firmware written over');
  assert.equal(nodeSketch({ ...UNO, firmware: 'uno/hello.elf' }, FILES).hex, 'uno/blink.hex', 'an .elf firmware: a .hex of its own');
  // (several: the one named as its firmware, else the first)
  const two = [...FILES, 'uno/main.ino'];
  assert.equal(nodeSketch(UNO, two).main, 'uno/blink.ino');
  assert.equal(nodeSketch({ ...UNO, firmware: 'uno/main.hex' }, two).main, 'uno/main.ino');
  assert.deepEqual(nodeSketch({ ...UNO, id: 'fpga' }, FILES), { error: 'fpga: no sketch in its folder fpga/ (an .ino: write one, or draw its program)' });
  assert.deepEqual(nodeSketch(UNO, ['uno/my sketch.ino']), { error: 'uno/my sketch.ino: a sketch\'s name is letters, digits, _ . and - (arduino-cli\'s)' });
});

const DIR = '/w/p/build/nodes/uno/firmware/blink';
const OUT = `${DIR}/blink.ino: In function 'void loop()':
${DIR}/blink.ino:12:3: error: 'digitalWrit' was not declared in this scope
   12 |   digitalWrit(13, HIGH);
      |   ^~~~~~~~~~~
${DIR}/blink.ino:12:3: note: suggested alternative: 'digitalWrite'
${DIR}/util.cpp:4:7: warning: unused variable 'x' [-Wunused-variable]
${DIR}/util.cpp:4:7: warning: unused variable 'x' [-Wunused-variable]
${DIR}/lib/ring.c:9: warning: "N" redefined
/opt/arduino15/packages/arduino/hardware/avr/1.8.6/cores/arduino/main.cpp:43: undefined reference to \`setup'
/tmp/ccA.ltrans0.ltrans.o: In function \`main':
collect2: error: ld returned 1 exit status
${DIR}/blink.ino:1:10: fatal error: Missing.h: No such file or directory
Error during build: exit status 1`;

test('#5503 gcc\'s messages: ERROR / WARNING lines by the project\'s file, line and column; notes, context and quoted lines left out; once each', () => {
  const { errors, warnings } = compilerMessages(OUT, p => sketchFileOf(p, DIR, 'uno'));
  assert.deepEqual(errors, [
    "ERROR: uno/blink.ino:12:3: 'digitalWrit' was not declared in this scope",
    "ERROR: undefined reference to `setup'",
    'ERROR: collect2: error: ld returned 1 exit status',
    'ERROR: uno/blink.ino:1:10: Missing.h: No such file or directory',
  ]);
  assert.deepEqual(warnings, ["WARNING: uno/util.cpp:4:7: unused variable 'x' [-Wunused-variable]", 'WARNING: uno/lib/ring.c:9: "N" redefined']);
  assert.deepEqual(compilerMessages('Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.\n'), { errors: [], warnings: [] }, 'arduino-cli\'s size lines: no message');
  assert.deepEqual(compilerMessages('Sketch too big; see https://support.arduino.cc/hc/en-us/articles/360013825179 for tips on reducing it.').errors,
    ['ERROR: Sketch too big; see https://support.arduino.cc/hc/en-us/articles/360013825179 for tips on reducing it.']);
  // (a file outside the sketch: its name, the path of this computer left out)
  assert.deepEqual(compilerMessages('/opt/core/Arduino.h:5:1: warning: x').warnings, ['WARNING: Arduino.h:5:1: x']);
});

test('#5503 the linker\'s collect2 line: an ERROR of no file', () => {
  assert.deepEqual(compilerMessages('collect2: error: ld returned 1 exit status').errors, ['ERROR: collect2: error: ld returned 1 exit status']);
});

test('#5503 a sketch copy\'s paths as the project\'s: its node\'s folder; arduino-cli\'s .ino.cpp its .ino; elsewhere none', () => {
  assert.equal(sketchFileOf(`${DIR}/blink.ino`, DIR, 'uno'), 'uno/blink.ino');
  assert.equal(sketchFileOf(`${DIR}/lib/ring.c`, `${DIR}/`, 'uno'), 'uno/lib/ring.c');
  assert.equal(sketchFileOf(`${DIR}/blink.ino.cpp`, DIR, 'uno'), 'uno/blink.ino');
  assert.equal(sketchFileOf('C:\\w\\p\\build\\nodes\\uno\\firmware\\blink\\blink.ino', 'C:\\w\\p\\build\\nodes\\uno\\firmware\\blink', 'uno'), 'uno/blink.ino');
  assert.equal(sketchFileOf('/elsewhere/blink.ino', DIR, 'uno'), null);
});

test('#5503 a console line\'s location in an .ino: its file and line, the project\'s path', () => {
  assert.deepEqual(messageLocation("ERROR: uno/blink.ino:12:3: 'x' was not declared"), { file: 'uno/blink.ino', line: 12, col: 3 });
  assert.equal(projectPath('uno/blink.ino', FILES), 'uno/blink.ino');
});
