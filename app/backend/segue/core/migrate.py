"""Run once at start-up: apply migrations, then make sure the five staff accounts exist."""
import asyncio
import logging
import subprocess
import sys

from sqlalchemy import select

from .db import StaffUser, session
from .settings import get_settings
from .util import hash_password, verify_password

ROLES = ("ops", "crew", "ground", "authority", "admin")


async def seed_staff() -> None:
    """Each role has its own password (SEED_PASSWORD_<ROLE>), so the outside authority's login is not
    the admin's. An account still on the old shared password is moved to its own."""
    s = get_settings()
    async with session() as db:
        for role in ROLES:
            password = getattr(s, f"seed_password_{role}")
            if not password:
                logging.warning("SEED_PASSWORD_%s is not set: account left as it is", role.upper())
                continue
            email = f"{role}@segue.local"
            user = (await db.execute(select(StaffUser).where(StaffUser.email == email))).scalar_one_or_none()
            if user is None:
                db.add(StaffUser(email=email, role=role, password_hash=hash_password(password)))
            elif s.seed_staff_password and verify_password(s.seed_staff_password, user.password_hash):
                user.password_hash = hash_password(password)
        await db.commit()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    asyncio.run(seed_staff())
    from .bus import ensure_topics
    asyncio.run(ensure_topics())
    logging.info("migrations applied, staff accounts ready")


if __name__ == "__main__":
    main()
