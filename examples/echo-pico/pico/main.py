# main.py: the echo-pico example (a Raspberry Pi Pico or Pico W, MicroPython): each line typed in its console (its USB
# serial port) read and sent back, its LED toggled at each one. Type a line in the console and press Enter; the
# Simulation Properties' stimulus file, echo.stim.json, types "hello" for Simulate.
from machine import Pin

led = Pin("LED", Pin.OUT)
on = False
print("Type a line and press Enter.")
while True:
    line = input("> ")
    on = not on
    led.value(on)
    print("echo:", line)
