"""Create .env with freshly generated secrets. Safe to re-run: it keeps values that are already set.

    python scripts/init_env.py
"""
import base64
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
example, target = root / ".env.example", root / ".env"

existing = {}
if target.exists():
    for line in target.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            existing[key.strip()] = value.strip()

generated = {
    "POSTGRES_PASSWORD": secrets.token_urlsafe(18),
    "RABBIT_PASSWORD": secrets.token_urlsafe(18),
    "PII_KEY": base64.urlsafe_b64encode(os.urandom(32)).decode(),  # a Fernet key
    "JWT_SIGNING_SECRET": secrets.token_urlsafe(48),
    "REDIS_PASSWORD": secrets.token_urlsafe(18),
    **{f"SEED_PASSWORD_{role}": secrets.token_urlsafe(12) for role in ("OPS", "CREW", "GROUND", "AUTHORITY", "ADMIN")},
}

values = dict(existing)
for key, value in generated.items():
    values.setdefault(key, value)
    if not values[key]:
        values[key] = value

lines = []
for line in example.read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, default = line.split("=", 1)
        key = key.strip()
        value = values.get(key, default)
        if key == "REDIS_URL" and "@" not in value:
            value = default  # an older .env without the Redis password
        # Compose does not expand ${...} inside env_file values, so write the URLs out in full.
        value = value.replace("${POSTGRES_PASSWORD}", values["POSTGRES_PASSWORD"]).replace("${RABBIT_PASSWORD}", values["RABBIT_PASSWORD"]).replace("${REDIS_PASSWORD}", values["REDIS_PASSWORD"])
        lines.append(f"{key}={value}")
    else:
        lines.append(line)
target.write_text("\n".join(lines) + "\n")
print(f"Wrote {target}")
print("Staff accounts: ops@, crew@, ground@, authority@ and admin@segue.local. Each has its own password: SEED_PASSWORD_<ROLE> in .env.")
if not values.get("AIRLABS_API_KEY"):
    print("Next: put your AirLabs key in .env as AIRLABS_API_KEY.")
