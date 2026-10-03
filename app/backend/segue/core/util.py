"""Small shared pieces: encryption of personal data, cache and idempotency keys, password hashing."""
import hashlib
import hmac
import os
from base64 import b64decode, b64encode

from cryptography.fernet import Fernet

from .settings import get_settings


def _fernet() -> Fernet:
    key = get_settings().pii_key
    if not key:
        raise RuntimeError("PII_KEY is not set. Run scripts/init_env.py to generate secrets.")
    return Fernet(key.encode())


def encrypt(value: str | None) -> str | None:
    return None if value in (None, "") else _fernet().encrypt(value.encode()).decode()


def decrypt(token: str | None) -> str | None:
    return None if not token else _fernet().decrypt(token.encode()).decode()


def risk_cache_key(connection_id: str, version: str) -> str:
    """One risk per connection per data version. A new flight event is a new version, so a stale risk is never served."""
    return f"risk:{connection_id}:{version}"


def idempotency_key(connection_id: str, itinerary_id: str | None, decision_type: str, event_id: str) -> str:
    """The same event redelivered yields the same key, so no decision or alert is created twice."""
    return f"{connection_id}:{itinerary_id or '-'}:{decision_type}:{event_id}"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return b64encode(salt).decode() + "$" + b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_b64, digest_b64 = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=b64decode(salt_b64), n=2**14, r=8, p=1)
        return hmac.compare_digest(digest, b64decode(digest_b64))
    except Exception:
        return False


def pseudonym(principal_id: str) -> str:
    """A short, stable reference staff can read out without it being the person's identity."""
    return "P-" + hashlib.sha256(principal_id.encode()).hexdigest()[:6].upper()
