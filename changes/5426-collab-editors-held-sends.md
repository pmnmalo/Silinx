In detail:
- The test of the editor link renewed while an editor's request is on its way (#5115) catches its held socket's queued sends: one still queued when the test closed its sockets failed on a closed socket, an unhandled rejection after the test ("the socket is not open"), which failed the file on Linux CI; a send that fails during the test is asserted none (#5426).
