; hello.asm: the Arduino Uno's firmware of the uart-avr example (an ATmega328P at 16 MHz), its .hex made from it.
; The USART at 9600 baud, 8N1, on D1 (TX) and D0 (RX): it sends "Hello from Arduino!" CR LF to the FPGA,
; and shows each byte it receives (the FPGA echoes each one back) on port B (D8..D13), while it sends too.
    ldi r16, 0
    sts 0xc5, r16          ; UBRR0H
    ldi r16, 103           ; UBRR0L: 9600 baud at 16 MHz
    sts 0xc4, r16
    ldi r16, 0x06          ; UCSR0C: 8 data bits, no parity, 1 stop bit
    sts 0xc2, r16
    ldi r16, 0x18          ; UCSR0B: the receiver and the transmitter on
    sts 0xc1, r16
    ldi r16, 0x3f          ; DDRB: D8..D13 outputs
    out 0x04, r16
    ldi r17, 'H'
    rcall send
    ldi r17, 'e'
    rcall send
    ldi r17, 'l'
    rcall send
    ldi r17, 'l'
    rcall send
    ldi r17, 'o'
    rcall send
    ldi r17, ' '
    rcall send
    ldi r17, 'f'
    rcall send
    ldi r17, 'r'
    rcall send
    ldi r17, 'o'
    rcall send
    ldi r17, 'm'
    rcall send
    ldi r17, ' '
    rcall send
    ldi r17, 'A'
    rcall send
    ldi r17, 'r'
    rcall send
    ldi r17, 'd'
    rcall send
    ldi r17, 'u'
    rcall send
    ldi r17, 'i'
    rcall send
    ldi r17, 'n'
    rcall send
    ldi r17, 'o'
    rcall send
    ldi r17, '!'
    rcall send
    ldi r17, 13            ; CR
    rcall send
    ldi r17, 10            ; LF
    rcall send
loop:
    lds r16, 0xc0          ; UCSR0A
    sbrc r16, 7            ; RXC0: a byte received?
    rcall show
    rjmp loop
send:                      ; r17 sent, the bytes received meanwhile shown (the USART keeps one only)
    lds r16, 0xc0          ; UCSR0A
    sbrc r16, 7            ; RXC0: a byte received?
    rcall show
    sbrs r16, 5            ; UDRE0: room for a byte?
    rjmp send
    sts 0xc6, r17          ; UDR0: sent
    ret
show:
    lds r18, 0xc6          ; UDR0: the byte received
    out 0x05, r18          ; PORTB: on D8..D13
    ret
