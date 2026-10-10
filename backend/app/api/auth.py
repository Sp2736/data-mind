import hmac

from fastapi import APIRouter, HTTPException, status
from app.config import settings
from app.deps import create_access_token
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    # Use hmac.compare_digest for constant-time comparison (T14 — prevents timing attacks).
    email_match = hmac.compare_digest(
        payload.email.lower().encode(), settings.local_user_email.lower().encode()
    )
    pw_match = hmac.compare_digest(
        payload.password.encode(), settings.local_user_password.encode()
    )
    if not email_match or not pw_match:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(subject=settings.local_user_email)
    return LoginResponse(
        access_token=token,
        user={"email": settings.local_user_email, "role": "analyst"},
    )