#include "counter.h"
bool Counter::tick() { if (++n_ < top_) return false; n_ = 0; return true; }
