import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import jwt, JWTError

from app.config import settings
from app.services import job_bus

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ws"])


def _verify_token(token: str | None) -> bool:
    """Browsers can't set Authorization headers on a WS handshake, so the
    token is passed as a query param instead: /ws/datasets/{id}/status?token=...
    """
    if not token:
        return False
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return True
    except JWTError:
        return False


@router.websocket("/ws/datasets/{dataset_id}/status")
async def dataset_status_ws(websocket: WebSocket, dataset_id: str, token: str | None = None):
    if not _verify_token(token):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    queue = job_bus.subscribe(dataset_id)
    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WS error for dataset %s", dataset_id)
    finally:
        job_bus.unsubscribe(dataset_id, queue)
