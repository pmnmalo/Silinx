; adc.asm: the adc-pic24 example's firmware: the potentiometer R6 (AN5) read by the A/D converter again and again,
; its position on the LEDs D3..D10 (RA0..RA7) as a bar: none lit at one end, all eight at the other
; (the Explorer 16/32's PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, as its configuration words are erased but the
; watchdog's, off). Its .hex is made from it (the uart-pic24 example's way: no XC16 needed to run it).
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    clr 0x066a               ; ANSA: RA0..RA7 digital
    mov #0xff00, w0          ; TRISA: RA0..RA7 outputs (the LEDs D3..D10)
    mov w0, 0x0662
    mov #5, w0
    mov w0, 0x074c           ; AD1CHS: AN5 (R6)
    mov #0x0001, w0
    mov w0, 0x074a           ; AD1CON3: TAD 2 Tcy
    mov #0x8000, w0
    mov w0, 0x0746           ; AD1CON1: the converter on, 10 bits
loop:
    bset 0x0746, #1          ; SAMP: sampling
    repeat #20
    nop
    bclr 0x0746, #1          ; the conversion
wait:
    btss 0x0746, #0          ; DONE
    bra wait
    mov 0x0712, w1           ; ADC1BUF0: 0..1023
; the bar: (code + 64) / 128 LEDs lit (0 to 8), the lowest first
    mov #64, w0
    add w1, w0, w1
    lsr w1, #7, w0           ; W0 the LEDs lit
    mov #1, w1
    sl w1, w0, w1
    dec w1, w1               ; (1 << n) - 1
    mov w1, 0x0666           ; LATA
    bra loop
