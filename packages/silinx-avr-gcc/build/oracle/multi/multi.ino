// multi: a sketch of several files: another .ino, a C file and its header, a C++ class
#include "pulse.h"
#include "counter.h"

Counter c(10);

void setup() { pinMode(9, OUTPUT); }

void loop() { if (c.tick()) pulse(9, width()); }
