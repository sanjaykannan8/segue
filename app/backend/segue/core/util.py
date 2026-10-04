"""Small shared pieces: encryption of personal data, cache and idempotency keys, password hashing."""
import hashlib
import hmac
import os
from base64 import b64decode, b64encode

from cryptography.fernet import Fernet, MultiFernet

from .settings import get_settings


def _fernet() -> MultiFernet:
    """PII_KEY may hold several keys separated by commas: the first encrypts, any of them decrypts.
    That is the rotation path: put the new key first, re-encrypt, then drop the old one."""
    keys = [k.strip() for k in get_settings().pii_key.split(",") if k.strip()]
    if not keys:
        raise RuntimeError("PII_KEY is not set. Run scripts/init_env.py to generate secrets.")
    return MultiFernet([Fernet(k.encode()) for k in keys])


def encrypt(value: str | None) -> str | None:
    return None if value in (None, "") else _fernet().encrypt(value.encode()).decode()


def decrypt(token: str | None) -> str | None:
    return None if not token else _fernet().decrypt(token.encode()).decode()


def risk_cache_key(connection_id: str, version: str) -> str:
    """One risk per connection per data version. A new flight event is a new version, so a stale risk is never served."""
    return f"risk:{connection_id}:{version}"


def idempotency_key(connection_id: str, itinerary_id: str | None, decision_type: str, event_id: str) -> str:
    """The same event redelivered yields the same key, so no decision or alert is created twice."""
    # Hashed to a fixed 64 characters, so "<key>:<routing key>" always fits the outbox's message id column.
    return hashlib.sha256(f"{connection_id}:{itinerary_id or '-'}:{decision_type}:{event_id}".encode()).hexdigest()


SCRYPT_LOG_N = 17  # OWASP's current floor for scrypt (N=2^17, r=8, p=1): about 128 MB and a fraction of a second per check


def _scrypt(password: str, salt: bytes, log_n: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**log_n, r=8, p=1, maxmem=2**28)


def hash_password(password: str) -> str:
    """`<log2 N>$<salt>$<digest>`. The cost is stored with the hash, so it can be raised later without breaking old ones."""
    salt = os.urandom(16)
    return f"{SCRYPT_LOG_N}${b64encode(salt).decode()}${b64encode(_scrypt(password, salt, SCRYPT_LOG_N)).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        parts = stored.split("$")
        log_n, salt_b64, digest_b64 = (int(parts[0]), parts[1], parts[2]) if len(parts) == 3 else (14, parts[0], parts[1])  # two parts: a hash from before the cost was stored
        return hmac.compare_digest(_scrypt(password, b64decode(salt_b64), log_n), b64decode(digest_b64))
    except Exception:
        return False


def needs_rehash(stored: str) -> bool:
    return not stored.startswith(f"{SCRYPT_LOG_N}$")


def pseudonym(principal_id: str) -> str:
    """A short, stable reference staff can read out without it being the person's identity."""
    return "P-" + hashlib.sha256(principal_id.encode()).hexdigest()[:6].upper()


def mask_name(name: str | None) -> str | None:
    """First and last letter of each word with three stars between: "Priya Sharma" -> "P***a S***a".
    The stars are a fixed count, so the mask does not give away the length, and a word of three
    letters or fewer shows only its first letter ("Ali" -> "A***")."""
    if not name:
        return None
    return " ".join(word[0] + "***" + (word[-1] if len(word) > 3 else "") for word in name.split())
