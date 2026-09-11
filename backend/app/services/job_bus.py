"""In-process asyncio.Queue registry keyed by dataset_id.

Single-process local app -> no Redis/pubsub needed. Each connected
WebSocket client for a dataset gets its own queue (fan-out via a set of
queues per dataset_id) so multiple browser tabs watching the same dataset
all get updates.

Not persisted: if the backend restarts mid-run, in-flight event history is
lost, but the source of truth (analysis_runs.status in Postgres) is not —
a reconnecting client should first GET the current run status, then
subscribe for further pushes.
"""
import asyncio
from collections import defaultdict

_queues: dict[str, set[asyncio.Queue]] = defaultdict(set)


def subscribe(dataset_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _queues[dataset_id].add(q)
    return q


def unsubscribe(dataset_id: str, q: asyncio.Queue) -> None:
    _queues[dataset_id].discard(q)
    if not _queues[dataset_id]:
        _queues.pop(dataset_id, None)


async def publish(dataset_id: str, event: dict) -> None:
    for q in list(_queues.get(dataset_id, ())):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            # Drop the oldest event rather than block the publisher —
            # status is idempotent/re-fetchable, so a dropped event just
            # means a redundant later GET, not lost data.
            try:
                q.get_nowait()
                q.put_nowait(event)
            except asyncio.QueueEmpty:
                pass
