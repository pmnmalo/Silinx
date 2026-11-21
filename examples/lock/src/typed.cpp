// Silinx example (lock): the digits typed, a C++ function made into hardware by Silinx HLS: each call with a digit
// shifts it in on the right of the four shown (the oldest one out on the left), a call with clear blanks them (15: a
// blank digit of the display). The four digits are a static variable: kept from call to call, a register.
// Its HDL is generated from this file, and top.vhd instances it as any other module.
#include <iostream>
#include "ap_int.h"

void typed(bool clear, ap_uint<4> digit, ap_uint<16> &shown) {
  static ap_uint<16> digits = 0xFFFF;
  if (clear)
    digits = 0xFFFF;
  else
    digits = (digits << 4) | digit;
  shown = digits;
}

// the test bench (C Simulation, C/RTL Co-simulation): main() is never made into hardware; 0 returned when every
// result is right
int main() {
  int errors = 0;
  ap_uint<16> shown;
  const int code[4] = {2, 0, 2, 6};
  const unsigned expected[4] = {0xFFF2, 0xFF20, 0xF202, 0x2026};
  for (int k = 0; k < 4; k++) {
    typed(false, code[k], shown);
    std::cout << "typed " << code[k] << ": " << std::hex << shown << std::dec << std::endl;
    if (shown != expected[k]) errors++;
  }
  typed(true, 0, shown);
  if (shown != 0xFFFF) errors++;
  if (errors) std::cout << "FAIL: " << errors << " wrong result(s)" << std::endl;
  else std::cout << "PASS" << std::endl;
  return errors;
}
