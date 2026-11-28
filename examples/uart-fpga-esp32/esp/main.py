# main.py: the ESP32's program of the uart-fpga-esp32 example (MicroPython).
# UART(2) at 9600 baud, 8N1, on GPIO17 (TX) and GPIO16 (RX): it sends
# "Hello from ESP32!" to the FPGA, which echoes each byte back, and prints
# each byte it receives (the echo, and the FPGA's own message when its BTN0
# is pressed) in its console.
from machine import UART
import time

uart = UART(2, baudrate=9600, tx=17, rx=16)
uart.write("Hello from ESP32!\r\n")
while True:
    if uart.any():
        print(uart.read().decode(), end="")
    time.sleep_ms(1)
