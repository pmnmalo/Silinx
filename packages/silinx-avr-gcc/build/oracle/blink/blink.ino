// blink: the built-in LED (D13) toggled every 500 ms, a helper called above its definition
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  toggle(LED_BUILTIN);
  delay(500);
}

void toggle(int pin) { digitalWrite(pin, !digitalRead(pin)); }
