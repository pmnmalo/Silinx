; blink.asm: the blinky-pic24 example's firmware: the LED D3 (RA0) on for a quarter of a second, then off
; (the Explorer 16/32's PIC24FJ1024GB610 at Fcy 2 MHz: its FRC divided, as its configuration words are erased but the
; watchdog's, off). Its .hex is made from it (the uart-pic24 example's way: no XC16 needed to run it).
    goto main
    .org 0x200
main:
    mov #0x0900, w15         ; the stack
    clr 0x066a               ; ANSA: RA0..RA7 digital
    mov #0xff00, w0          ; TRISA: RA0..RA7 outputs (the LEDs D3..D10)
    mov w0, 0x0662
loop:
    btg 0x0666, #0           ; LATA: D3 toggled
    rcall wait
    bra loop
; wait: a quarter of a second, 5 x 33333 x 3 cycles
wait:
    mov #5, w3
outer:
    mov #33333, w2
inner:
    dec w2, w2
    bra nz, inner
    dec w3, w3
    bra nz, outer
    return
