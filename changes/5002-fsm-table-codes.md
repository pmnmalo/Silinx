In short:

- **A state's code typed in its table:** under a user-defined encoding, the transition table's Code column can be edited
  on each state's first row.

In detail:

- **The user's codes in the transition table (#5002):** under the encoding User-defined (#4908), a state's code is a field
  on its first row of the transition table, set as its Properties set it (`setStateCode`: binary digits, blanks and `_`
  left out) through `core/fsm-edit.js` `setCode`; Check reports a code not valid, of another width or used twice. The
  Next code column follows the next state; under the other encodings the codes stay read only.
