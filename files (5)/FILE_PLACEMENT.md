# DataMind — File Placement Fixes

## What was wrong
Your zip had a top-level `files-phase-4/` folder containing 5 files that were
meant to live inside `backend/app/`:

| Loose file (`files-phase-4/`) | Belongs at |
|---|---|
| `main.py` | `backend/app/main.py` |
| `storage.py` | `backend/app/services/storage.py` |
| `schemas_datasets.py` | `backend/app/schemas/datasets.py` |
| `profiling.py` | `backend/app/services/profiling.py` |
| `api_datasets.py` | `backend/app/api/datasets.py` |

I diffed each loose file against its already-in-place counterpart: they were
**byte-identical in content**, just saved later (Sep 1 vs Aug 28) and with
LF line endings instead of the originals' CRLF. In other words, these were
your own re-saves of the same files, dropped in the wrong spot — not
divergent versions. There was no merge conflict to resolve.

`files-phase-4/TODO.md` was likewise an exact duplicate of the root
`TODO.md`.

## What I did (already applied in the corrected zip)
1. Copied each `files-phase-4/*` file over its `backend/app/...` counterpart
   (functionally a no-op, cosmetic LF cleanup only).
2. Deleted the `files-phase-4/` folder and its duplicate `TODO.md`.
3. Normalized line endings to LF across `backend/app/**/*.py` and `*.md` —
   your repo was a mix of CRLF (older files) and LF (newer saves), which is
   an easy source of noisy git diffs on Windows/WSL boundary work. Pick one
   and enforce it going forward (see below).
4. Fixed `backend/requirements.txt`, which was saved as **UTF-16 with a
   BOM** (likely from PowerShell's `>` redirect or a `Set-Content` without
   `-Encoding utf8`) — `pip install -r requirements.txt` would have choked
   on this. Re-saved as plain UTF-8, LF.

## To prevent this going forward
Add a `.gitattributes` at the repo root:
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.zip binary
```
And if you're on Windows/PowerShell, always save/redirect text files with
explicit UTF-8: `Set-Content -Encoding utf8` or `Out-File -Encoding utf8`,
never the PowerShell default (UTF-16).

## ⚠️ Separate, more urgent issue found while doing this
`backend/.env` contains a live, unredacted `GOOGLE_API_KEY`. This is a
secret leak independent of the file-placement issue — **rotate that key now**
in Google AI Studio / Google Cloud console, and double check `.env` has
never been committed to git history (`git log --all --full-history -- backend/.env`).
`.env` is already in `backend/.gitignore` going forward, which is correct —
this only protects future commits, not anything already pushed.
