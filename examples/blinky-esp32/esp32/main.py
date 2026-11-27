# main.py: the blinky-esp32 example (an ESP32 DevKitC, MicroPython): GPIO2 on for half a second, then off for half a
# second (an LED wired to it blinks: the DevKitC has none of its own), each change said in its console.
from machine import Pin
import time

led = Pin(2, Pin.OUT)
on = False
while True:
    on = not on
    led.value(on)
    print("GPIO2 on" if on else "GPIO2 off")
    time.sleep(0.5)
