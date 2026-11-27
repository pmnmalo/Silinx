; buttons.asm: the buttons-pic24 example's firmware: each button lights its LED while it is pressed (a pressed
; button's pin at 0, its pull-up's 1 released): S3 (RD6) D3 (RA0), S4 (RD13) D4 (RA1), S6 (RD7) D6 (RA3), and S5
; (RA7: D10's pin too, an input here) D7 (RA4)
; (the Explorer 16/32's PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, as its configuration words are erased but the
; watchdog's, off). Its .hex is made from it (the uart-pic24 example's way: no XC16 needed to run it).
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    clr 0x066a               ; ANSA: RA0..RA7 digital
    clr 0x06a6               ; ANSD: RD6, RD7 and RD13 digital
    mov #0xff80, w0          ; TRISA: RA0..RA6 outputs (the LEDs), RA7 an input (S5)
    mov w0, 0x0662
loop:
    clr w1                   ; the LEDs lit
    btss 0x06a0, #6          ; PORTD: S3 pressed
    bset w1, #0              ;   D3
    btss 0x06a0, #13         ; S4
    bset w1, #1              ;   D4
    btss 0x06a0, #7          ; S6
    bset w1, #3              ;   D6
    btss 0x0664, #7          ; PORTA: S5
    bset w1, #4              ;   D7
    mov w1, 0x0666           ; LATA
    bra loop
