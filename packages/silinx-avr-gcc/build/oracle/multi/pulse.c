#include <Arduino.h>
#include "pulse.h"
void pulse(unsigned char pin, int us) { digitalWrite(pin, HIGH); delayMicroseconds(us); digitalWrite(pin, LOW); }
