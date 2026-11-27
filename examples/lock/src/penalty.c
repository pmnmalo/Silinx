// Silinx example (lock): the penalty of a failure, a C function made into hardware by Silinx HLS: the seconds the lock
// stays locked after the first, the second and the third wrong code (3, 6, 9: the longer the more failures). A table
// of constants (a ROM) indexed by the number of failures the Petri net alarm counts.
// Its HDL is generated from this file, and top.vhd instances it as any other module: with no block protocol (ap_ctrl_none,
// #5841) it is logic alone, the penalty of the failures so far always at its output, no start nor done to connect.
#include <stdio.h>
#include "ap_int.h"

static const ap_uint<4> SECONDS[4] = {0, 3, 6, 9};

ap_uint<4> penalty(ap_uint<2> fails) {
#pragma HLS INTERFACE ap_ctrl_none port=return
  return SECONDS[fails];
}

// the test bench (C Simulation, C/RTL Co-simulation): main() is never made into hardware; 0 returned when every
// result is right
int main(void) {
  int errors = 0;
  for (int f = 0; f < 4; f++) {
    int s = penalty(f);
    printf("%d failure(s): %d s\n", f, s);
    if (s != 3 * f) errors++;
  }
  printf(errors ? "FAIL: %d wrong result(s)\n" : "PASS\n", errors);
  return errors;
}
