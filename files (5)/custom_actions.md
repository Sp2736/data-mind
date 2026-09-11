# DataMind — Custom Actions (Do These Yourself)

These four items were flagged as needing your action, not mine. Nothing in
the corrected zip does them for you.

## 1. Rotate the leaked Google API key
`backend/.env` had a live `GOOGLE_API_KEY` in the zip you uploaded. It's
redacted in the corrected zip, but the original value already passed
through my processing — treat it as compromised.
- Go to Google AI Studio (or Google Cloud Console, depending on where the
  key was issued) and revoke/rotate it.
- Generate a new key and put it in `backend/.env` as `GOOGLE_API_KEY=...`.
- Confirm `.env` has never been committed to git history:
  ```bash
  git log --all --full-history -- backend/.env
  ```
  If it has, the key needs rotating regardless of anything else — a
  history rewrite doesn't undo an already-exposed key.

## 2. Run the Alembic migration for `source_url`
The switch to URL-based ingestion added a `source_url` column to the
`datasets` table. This isn't applied to your database yet.
```bash
cd backend
alembic revision --autogenerate -m "add source_url to datasets"
alembic upgrade head
```

## 3. Set up Kaggle credentials
`seed_datasets.py` and any `kaggle.com` URL submitted through the API will
fail without this.
1. kaggle.com → your account → **Create New API Token** → downloads
   `kaggle.json`.
2. Place it at `~/.kaggle/kaggle.json` (Linux/Mac) or
   `C:\Users\<you>\.kaggle\kaggle.json` (Windows), permissions `600`.
3. Or set `KAGGLE_USERNAME` / `KAGGLE_KEY` in `backend/.env` instead of the
   file.
4. For competition URLs specifically, accept that competition's rules on
   kaggle.com first, or the API call 403s.

## 4. Install the new dependencies
`chromadb`, `sentence-transformers`, and `kaggle` were appended to
`requirements.txt` but not installed.
```bash
cd backend
pip install -r requirements.txt --break-system-packages   # or plain pip install inside a venv
```
Note: first run after this will also download the `all-MiniLM-L6-v2`
embedding model (~80MB, one-time, from Hugging Face) — make sure that's
reachable before you're fully offline.
