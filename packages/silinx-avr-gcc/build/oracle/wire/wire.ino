// wire: an LM75's temperature read over I2C (address 0x48) every second, printed
#include <Wire.h>

void setup() { Wire.begin(); Serial.begin(9600); }

void loop() {
  Wire.beginTransmission(0x48);
  Wire.write(0);
  Wire.endTransmission();
  Wire.requestFrom(0x48, 2);
  int t = (Wire.read() << 8) | Wire.read();
  Serial.println(t / 256.0);
  delay(1000);
}
