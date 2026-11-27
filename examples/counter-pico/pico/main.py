# main.py: the counter-pico example (a Raspberry Pi Pico or Pico W, MicroPython): a 4-bit binary counter on GP6..GP9
# (GP6 its lowest bit; GP0, GP1, GP4 and GP5 are its UARTs'), one count every quarter of a second, from 0 to 15 and
# again, each count said in its console.
from machine import Pin
import time

pins = [Pin(n, Pin.OUT) for n in range(6, 10)]   # GP6..GP9
count = 0
while True:
    for bit, pin in enumerate(pins):
        pin.value((count >> bit) & 1)
    print("count", count)
    count = (count + 1) % 16
    time.sleep(0.25)
