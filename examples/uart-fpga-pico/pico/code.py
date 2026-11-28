# code.py: the Raspberry Pi Pico's program of the uart-fpga-pico example, run by CircuitPython from its CIRCUITPY drive.
# busio.UART on GP0 (TX) and GP1 (RX) at 9600 baud, 8N1: it sends "Hello from the Pico!" CR LF to the FPGA, which
# echoes each byte back and shows it (its LEDs and its display); each line that comes back is printed on the console
# (the Pico's USB serial port) and toggles the Pico's LED. The FPGA's BTN0 sends its own message: printed too.
import time

import board
import busio
import digitalio

uart = busio.UART(board.GP0, board.GP1, baudrate=9600)
led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT

uart.write(b"Hello from the Pico!\r\n")
line = b""
while True:
    data = uart.read(1)
    if data:
        line += data
        if data == b"\n":
            print("echo:", line.decode().strip())
            led.value = not led.value
            line = b""
    time.sleep(0.001)
