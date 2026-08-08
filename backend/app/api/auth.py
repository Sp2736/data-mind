from fastapi import APIRouter, HTTPException, status
from app.config import settings
from app.deps import create_access_token
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    if payload.email.lower() != settings.local_user_email.lower() or payload.password != settings.local_user_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(subject=settings.local_user_email)
    return LoginResponse(
        access_token=token,
        user={"email": settings.local_user_email, "role": "analyst"},
    )