// counter.ino: the counter-arduino example (an Arduino Uno or Nano): a 6-bit binary counter on D8..D13, D8 its
// lowest bit and D13 (the LED L) its highest, one count every quarter of a second, from 0 to 63 and again. Its
// counter.hex is this sketch compiled (Compile Firmware: arduino-cli), so that it runs in the emulator with no compiler.

const int FIRST_PIN = 8;   // D8: the counter's lowest bit
const int BITS = 6;        // D8..D13

int count = 0;

void setup() {
  for (int i = 0; i < BITS; i++) pinMode(FIRST_PIN + i, OUTPUT);
}

void loop() {
  for (int i = 0; i < BITS; i++) digitalWrite(FIRST_PIN + i, (count >> i) & 1);
  count = (count + 1) % 64;
  delay(250);
}
