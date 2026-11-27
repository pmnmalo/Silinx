// blink.ino: the blinky-arduino example (an Arduino Uno or Nano): its LED L (D13) on for half a second, then off
// for half a second. Its blink.hex is this sketch compiled (Compile Firmware: arduino-cli), so that it runs in the
// emulator with no compiler.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
