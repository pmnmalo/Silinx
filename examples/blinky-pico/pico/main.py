# main.py: the blinky-pico example (a Raspberry Pi Pico or Pico W, MicroPython): its LED on for half a second, then
# off for half a second, each change said in its console.
from machine import Pin
import time

led = Pin("LED", Pin.OUT)
on = False
while True:
    on = not on
    led.value(on)
    print("LED on" if on else "LED off")
    time.sleep(0.5)
