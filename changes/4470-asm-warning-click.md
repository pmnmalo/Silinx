In detail:

- **The ASM editor's UI test clicks the warning again if its click was lost (#4470):** the re-check after `setModel`
  may draw the Warnings tab's rows anew under the click on a slow runner; the test waits for the row shown, then clicks
  it up to three times, 4 s each, until the box is selected.
