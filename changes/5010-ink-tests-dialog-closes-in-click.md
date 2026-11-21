In detail:

- **The handwriting UI tests read the corrected field the dialog held (#5010, #5013, #5014, #5017):** Fill Table and
  Insert close their dialog in the click since the one dialog framework (#4762: a validation that is not async closes
  it at once), so the tests keep the text field before the click and read it there, not from a dialog already gone.
