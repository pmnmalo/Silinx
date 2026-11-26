In detail:

- **The local server's downloaded files' routes (#5721, #5722; CodeQL's alerts 226 and 225):** `/vendor/rp2040/<file>`
  and `/vendor/micropython-jspi/<file>` answer a name they do not serve with a 404 that no longer repeats it (it was
  sent back as text, with the list of the files served), and a download that failed with its reason, both as JSON. Test:
  vendor-routes (a name with markup: the 404's body, its type, nothing downloaded).
