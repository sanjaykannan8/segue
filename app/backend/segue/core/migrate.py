"""Run once at start-up: apply migrations, then make sure the five staff accounts exist."""
import asyncio
import logging
import subprocess
import sys

from sqlalchemy import select

from .db import StaffUser, session
from .settings import get_settings
from .util import hash_password

ROLES = ("ops", "crew", "ground", "authority", "admin")


async def seed_staff() -> None:
    password = get_settings().seed_staff_password
    if not password:
        logging.warning("SEED_STAFF_PASSWORD is not set: no staff accounts created")
        return
    async with session() as db:
        for role in ROLES:
            email = f"{role}@segue.local"
            if (await db.execute(select(StaffUser).where(StaffUser.email == email))).scalar_one_or_none() is None:
                db.add(StaffUser(email=email, role=role, password_hash=hash_password(password)))
        await db.commit()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    asyncio.run(seed_staff())
    logging.info("migrations applied, staff accounts ready")


if __name__ == "__main__":
    main()
