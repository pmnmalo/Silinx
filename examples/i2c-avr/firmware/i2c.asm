; i2c.asm: the Arduino Uno's firmware of the i2c-avr example (an ATmega328P at 16 MHz), its .hex made from it.
; Its TWI an I2C master at 100 kHz (TWBR 72): every 47 ms or so it writes a count (0, 1, 2...) to the FPGA at the
; address 0x42 (its LEDs show it), then reads a byte back (the FPGA's switches) and shows it on D2..D7.
    ldi r16, 0xfc          ; DDRD: D2..D7 outputs (the byte read's bits 2..7)
    out 0x0a, r16
    ldi r16, 72            ; TWBR: SCL at 16 MHz / (16 + 2 x 72), 100 kHz
    sts 0xb8, r16
    ldi r20, 0             ; the count
main:
    ldi r16, 0xa4          ; TWCR: a START
    rcall go
    ldi r16, 0x84          ; TWDR: the address 0x42, to write
    sts 0xbb, r16
    ldi r16, 0x84          ; TWCR: sent
    rcall go
    sts 0xbb, r20          ; TWDR: the count
    ldi r16, 0x84
    rcall go
    ldi r16, 0xa4          ; a repeated START
    rcall go
    ldi r16, 0x85          ; TWDR: the address 0x42, to read
    sts 0xbb, r16
    ldi r16, 0x84
    rcall go
    ldi r16, 0x84          ; TWCR: a byte read, not acknowledged (the last one)
    rcall go
    lds r19, 0xbb          ; TWDR: the FPGA's switches
    ldi r16, 0x94          ; TWCR: a STOP
    sts 0xbc, r16
    out 0x0b, r19          ; PORTD: the byte on D2..D7
    inc r20
    ldi r24, 4             ; about 47 ms: 4 x 250 x 250 x 3 cycles
d0:
    ldi r22, 250
d1:
    ldi r23, 250
d2:
    dec r23
    brne d2
    dec r22
    brne d1
    dec r24
    brne d0
    rjmp main
go:                        ; TWCR written (r16), then TWINT waited for
    sts 0xbc, r16
wait:
    lds r18, 0xbc
    sbrs r18, 7
    rjmp wait
    ret
