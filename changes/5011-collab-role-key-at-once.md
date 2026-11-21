In detail:

- **Live sharing: an editor's new key, its id and its role taken at once (#5011):** since #4745 a follower given the
  editors' key took the key, then waited for its id: an edit sent in between named the old key's id with the new key
  (refused), and a page saw the new key before the role it came with (the roles test failed on it under load).
