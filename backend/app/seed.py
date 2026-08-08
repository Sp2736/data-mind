import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models import LocalUser
from app.config import settings


async def seed():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(LocalUser).where(LocalUser.email == settings.local_user_email))
        existing = result.scalar_one_or_none()
        if existing:
            print(f"Local user already exists: {existing.id}")
            return
        user = LocalUser(email=settings.local_user_email)
        session.add(user)
        await session.commit()
        print(f"Created local user: {user.id}")


if __name__ == "__main__":
    asyncio.run(seed())