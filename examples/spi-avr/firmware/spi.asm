; spi.asm: the Arduino Uno's firmware of the spi-avr example (an ATmega328P at 16 MHz), its .hex made from it.
; The SPI a master at fosc/128 (125 kHz), mode 0: every 47 ms or so it sends a count (0, 1, 2…) to the FPGA, SS
; (D10) low during the transfer, and shows the FPGA's answer (the count before plus one) on D2..D7.
    ldi r16, 0x2c          ; DDRB: SCK (D13), MOSI (D11) and SS (D10) outputs
    out 0x04, r16
    ldi r16, 0x04          ; PORTB: SS high
    out 0x05, r16
    ldi r16, 0xfc          ; DDRD: D2..D7 outputs (the answer's bits 2..7)
    out 0x0a, r16
    ldi r16, 0x53          ; SPCR: SPI on, master, fosc/128, mode 0, MSB first
    out 0x2c, r16
    ldi r20, 0             ; the count
main:
    ldi r16, 0             ; SS low
    out 0x05, r16
    out 0x2e, r20          ; SPDR: the count sent
wait:
    in r18, 0x2d           ; SPSR: the transfer over (SPIF)?
    sbrs r18, 7
    rjmp wait
    in r19, 0x2e           ; SPDR: the FPGA's answer
    ldi r16, 0x04          ; SS high
    out 0x05, r16
    out 0x0b, r19          ; PORTD: the answer on D2..D7
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
