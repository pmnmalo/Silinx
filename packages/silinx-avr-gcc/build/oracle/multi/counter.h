class Counter {
 public:
  explicit Counter(int top) : top_(top) {}
  bool tick();
 private:
  int top_, n_ = 0;
};
