/* A mock of the Arduino API for #5486's tests (test/reactive-c.test.js): a generated sketch compiled and run on the
   host, its pins and its clock the test harness's. Copyright 2026 Pedro Maló. AGPL-3.0-only. */
#ifndef SILINX_ARDUINO_MOCK_H
#define SILINX_ARDUINO_MOCK_H
#include <stdint.h>
#include <stdio.h>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19

#ifdef __cplusplus
extern "C" {
#endif
extern int mock_level[20];        /* each pin's level */
extern int mock_mode[20];         /* each pin's mode + 1 (0: never set) */
extern unsigned long mock_ms;     /* millis() */
extern int mock_errors;
static inline void pinMode(uint8_t pin, uint8_t mode) { mock_mode[pin] = mode + 1; }
static inline int digitalRead(uint8_t pin) {
  if (mock_mode[pin] != INPUT + 1) { printf("ERROR: pin %d read, not an input\n", pin); mock_errors++; }
  return mock_level[pin];
}
static inline void digitalWrite(uint8_t pin, uint8_t v) {
  if (mock_mode[pin] != OUTPUT + 1) { printf("ERROR: pin %d written, not an output\n", pin); mock_errors++; }
  mock_level[pin] = v ? HIGH : LOW;
}
static inline unsigned long millis(void) { return mock_ms; }
#ifdef __cplusplus
}
#endif
#endif
