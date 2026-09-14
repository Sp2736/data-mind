import asyncio
from app.db.session import AsyncSessionLocal
from app.api.runs import _execute_run
import sqlite3
from app.config import settings

async def resume_runs():
    db_path = settings.database_url.replace('sqlite+aiosqlite:///', '')
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id FROM analysis_runs WHERE status IN ('queued', 'running')")
    run_ids = [row[0] for row in c.fetchall()]
    conn.close()

    if not run_ids:
        print("No stuck runs found.")
        return

    print(f"Resuming {len(run_ids)} runs...")
    for run_id in run_ids:
        print(f"Executing {run_id}...")
        await _execute_run(run_id)
    print("Done!")

if __name__ == "__main__":
    asyncio.run(resume_runs())
