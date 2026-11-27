# main.py: the counter-esp32 example (an ESP32 DevKitC, MicroPython): a 4-bit binary counter on GPIO32, GPIO33, GPIO25
# and GPIO26 (side by side on its J2 header, GPIO32 the lowest bit), one count every quarter of a second, from 0 to 15
# and again, each count said in its console.
from machine import Pin
import time

pins = [Pin(n, Pin.OUT) for n in (32, 33, 25, 26)]
count = 0
while True:
    for bit, pin in enumerate(pins):
        pin.value((count >> bit) & 1)
    print("count", count)
    count = (count + 1) % 16
    time.sleep(0.25)
