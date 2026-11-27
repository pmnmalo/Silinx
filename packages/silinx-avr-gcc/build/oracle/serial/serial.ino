// serial: the USART at 9600 baud, each byte received sent back in upper case, a count printed
unsigned long count = 0;

void setup() { Serial.begin(9600); Serial.println(F("hello")); }

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    Serial.write(toupper(c));
    count++;
    if (c == '\n') { Serial.print("bytes: "); Serial.println(count); }
  }
}
