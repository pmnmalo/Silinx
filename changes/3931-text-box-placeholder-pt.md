In short:

- **Text boxes' hints in Portuguese.** A multi-line text box's placeholder and tip (the state diagram's description,
  the Module Wizard's, a truth table's notes, the handwriting panel's) are now translated.

In detail:

- **A text box's placeholder and tip translated (#3931):** the page's translator (web/js/i18n.js) left out every
  `textarea`, its own attributes with its text; it now translates their placeholder, title and aria-label, as an
  input's, and leaves their text, the user's, as it is.
