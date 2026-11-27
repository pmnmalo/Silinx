// spi: a byte counted out to an SPI shift register (SS on D10) every 100 ms
#include <SPI.h>

byte n = 0;

void setup() { pinMode(SS, OUTPUT); SPI.begin(); }

void loop() {
  digitalWrite(SS, LOW);
  SPI.transfer(n++);
  digitalWrite(SS, HIGH);
  delay(100);
}
