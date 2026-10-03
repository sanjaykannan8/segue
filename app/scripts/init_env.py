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
    "SESSION_SECRET": secrets.token_urlsafe(32),
    "SEED_STAFF_PASSWORD": secrets.token_urlsafe(9),
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
        # Compose does not expand ${...} inside env_file values, so write the URLs out in full.
        value = value.replace("${POSTGRES_PASSWORD}", values["POSTGRES_PASSWORD"]).replace("${RABBIT_PASSWORD}", values["RABBIT_PASSWORD"])
        lines.append(f"{key}={value}")
    else:
        lines.append(line)
target.write_text("\n".join(lines) + "\n")
print(f"Wrote {target}")
print("Staff accounts: ops@, crew@, ground@, authority@ and admin@segue.local. The password is SEED_STAFF_PASSWORD in .env.")
if not values.get("AIRLABS_API_KEY"):
    print("Next: put your AirLabs key in .env as AIRLABS_API_KEY.")
