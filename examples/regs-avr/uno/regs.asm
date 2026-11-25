; regs.asm: the Arduino Uno's firmware of the regs-avr example (an ATmega328P at 16 MHz), its .hex made from it.
; Its SPI a master at fosc/128 (125 kHz), mode 0, SS on D10, as pwm_regs.h's functions do: it writes clear (0x03)
; once, then every 47 ms or so writes duty (0x00) with a count (0, 1, 2...) and reads count (0x01, two bytes), its
; low byte shown on D2..D7. Each transaction: SS low, the command byte (R << 7 | address), the data bytes, SS high.
    ldi r16, 0x2c          ; DDRB: SCK (D13), MOSI (D11) and SS (D10) outputs
    out 0x04, r16
    ldi r16, 0x04          ; PORTB: SS high
    out 0x05, r16
    ldi r16, 0xfc          ; DDRD: D2..D7 outputs
    out 0x0a, r16
    ldi r16, 0x53          ; SPCR: SPI on, master, fosc/128, mode 0, MSB first
    out 0x2c, r16
    ldi r20, 0             ; the duty
    rcall low              ; clear (0x03) written: count back to 0
    ldi r16, 0x03
    rcall xfer
    ldi r16, 0x01
    rcall xfer
    rcall high
main:
    rcall low              ; duty (0x00) written
    ldi r16, 0x00
    rcall xfer
    out 0x2e, r20
    rcall wait
    rcall high
    rcall low              ; count (0x01) read: its low byte, then its high byte
    ldi r16, 0x81
    rcall xfer
    ldi r16, 0
    rcall xfer
    in r19, 0x2e
    ldi r16, 0
    rcall xfer
    rcall high
    out 0x0b, r19          ; PORTD: count's low byte on D2..D7
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
xfer:                      ; r16 sent (SPDR), the transfer waited for
    out 0x2e, r16
wait:
    in r18, 0x2d           ; SPSR: SPIF?
    sbrs r18, 7
    rjmp wait
    ret
low:                       ; SS low
    ldi r17, 0
    out 0x05, r17
    ret
high:                      ; SS high
    ldi r17, 0x04
    out 0x05, r17
    ret
