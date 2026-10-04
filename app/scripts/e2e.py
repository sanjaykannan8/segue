"""End-to-end check against a running stack (docker compose up).

    uv run --with httpx python scripts/e2e.py

Uses two made-up flights entered by hand, so it spends no AirLabs queries. It prints what it
sees at each step and exits non-zero on the first thing that is wrong.
"""
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

sys.stdout.reconfigure(encoding="utf-8")
API = "http://localhost:8000"
env = dict(line.split("=", 1) for line in (Path(__file__).resolve().parents[1] / ".env").read_text().splitlines() if "=" in line and not line.startswith("#"))
PASSWORDS = {role: env[f"SEED_PASSWORD_{role.upper()}"] for role in ("ops", "crew", "ground", "authority", "admin")}


def check(condition: bool, message: str) -> None:
    print(("  ok   " if condition else "  FAIL ") + message)
    if not condition:
        sys.exit(1)


def staff(role: str) -> httpx.Client:
    client = httpx.Client(base_url=API, timeout=20)
    response = client.post("/auth/login", json={"email": f"{role}@segue.local", "password": PASSWORDS[role]})
    check(response.status_code == 200, f"{role} logs in")
    return client


def wait_for(fn, seconds: float = 25):
    deadline = time.time() + seconds
    while time.time() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(0.5)
    return None


suffix = str(int(time.time()))[-4:]
now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
arrival = now + timedelta(hours=2)
inbound = {"flight_iata": f"T1{suffix}", "manual": {"origin": "DEL", "dest": "DXB", "sched_dep": (arrival - timedelta(hours=3)).isoformat(), "sched_arr": arrival.isoformat(), "arr_terminal": "3", "arr_gate": "C22"}}
outbound = {"flight_iata": f"T2{suffix}", "manual": {"origin": "DXB", "dest": "LHR", "sched_dep": (arrival + timedelta(minutes=95)).isoformat(), "sched_arr": (arrival + timedelta(hours=8)).isoformat(), "dep_terminal": "3", "dep_gate": "B14"}}

print("1. Passenger: notice, consent, trip")
pax = httpx.Client(base_url=API, timeout=20)
notice = pax.get("/notice").json()
check(len(notice["purposes"]) == 4 and notice["purposes"][0]["required"], "notice lists four purposes, tracking required")
check(pax.post("/consent", json={"notice_version": notice["version"], "purposes": ["notifications"], "language": "en", "adult": True}).status_code == 400, "consent without tracking is refused")
check(pax.post("/consent", json={"notice_version": notice["version"], "purposes": ["tracking", "notifications", "assistance", "authority_share"], "language": "en", "adult": True, "name": "Test Passenger", "email": f"test-{suffix}@example.com"}).status_code == 200, "consent accepted, session cookie set")
check(pax.get("/me").json()["email_verified"] is False, "a new email address is not used until its owner confirms it")
def code_mail():
    found = httpx.get("http://localhost:8025/api/v1/search", params={"query": f"to:test-{suffix}@example.com"}, timeout=10).json()
    for m in found.get("messages") or []:
        text = httpx.get(f"http://localhost:8025/api/v1/message/{m['ID']}", timeout=10).json().get("Text", "")
        match = re.search(r"\b(\d{6})\b", text)
        if "confirm" in m["Subject"] and match:
            return match.group(1)
    return None
code = wait_for(code_mail, 20)
check(bool(code), "a confirmation code was emailed")
check(pax.post("/me/email/verify", json={"code": "000000" if code != "000000" else "111111"}).status_code == 400, "a wrong code is refused")
check(pax.post("/me/email/verify", json={"code": code}).json().get("email_verified") is True, "the right code confirms the address")
view = pax.post("/itineraries", json={"inbound": inbound, "outbound": outbound, "seat": "12A", "assistance": "wheelchair"})
check(view.status_code == 200, f"trip added ({view.status_code})")
scored = wait_for(lambda: (c := pax.get("/me/connection").json()).get("risk") and c)
check(bool(scored), "engine scored the connection")
print(f"       risk={scored['risk']['level']} buffer={scored['risk']['buffer_min']} min source={scored['risk']['source']} degraded={scored['degraded']}")
check(scored["risk"]["left_min"] == 75 and scored["risk"]["needed_min"] == 48, "buffer arithmetic at DXB: 95 - 20 gate close = 75 left; 8 off the aircraft + 30 C gates to B gates + 10 security = 48 needed")
check(any("B and C gates" in step["label"] for step in scored["steps"]), "the route step names the real DXB link")
first_version = scored["risk"]["version"]

print("2. Control panel: inject a 25-minute delay on the inbound")
admin = staff("admin")
flight_id = scored["inbound"]["id"]
updated = admin.post("/admin/events", json={"flight_id": flight_id, "delay_min": 25})
check(updated.status_code == 200 and updated.json()["delay_min"] == 25, "flight updated, version bumped")
rescored = wait_for(lambda: (c := pax.get("/me/connection").json()).get("risk") and c["risk"]["version"] != first_version and c)
check(bool(rescored), "new flight version produced a new risk")
print(f"       risk={rescored['risk']['level']} buffer={rescored['risk']['buffer_min']} min my_buffer={rescored['my_buffer_min']} min source={rescored['risk']['source']}")
check(rescored["risk"]["buffer_min"] == 2, "buffer is now 2 min (27 - 25)")
check(rescored["my_buffer_min"] < rescored["risk"]["buffer_min"], "the passenger's own buffer is lower (seat row and wheelchair)")

print("3. Staff screens")
ops = staff("ops")
board = wait_for(lambda: (b := ops.get("/ops/board").json())["connections"] and b)
check(bool(board), "ops board lists the connection")
print(f"       counts={board['counts']} degraded={board['degraded']} actions={[(a['type'], a['answer'], a['gate'], a['status']) for a in board['actions'][:6]]}")
pending = [a for a in board["actions"] if a["status"] == "pending"]
if pending:
    decided = ops.post(f"/ops/decisions/{pending[0]['decision_id']}/approve")
    check(decided.status_code == 200 and decided.json()["status"] == "approved", f"ops approves '{pending[0]['title']}'")
    check(ops.post(f"/ops/decisions/{pending[0]['decision_id']}/approve").status_code == 409, "a decision cannot be approved twice")
crew = staff("crew")
check(crew.get("/crew/list").status_code == 200, "crew can read the deplaning list")
check(crew.get("/ops/board").status_code == 403, "crew cannot read the ops board (role check)")
check(crew.get("/authority/requests").status_code == 403, "crew cannot read authority requests")
ground = staff("ground")
check(ground.get("/ground/queue").status_code == 200, "ground can read the dispatch queue")
authority = staff("authority")
check(authority.get("/authority/requests").status_code == 200, "authority can read fast-track requests")
print(f"       crew rows={sum(len(f['items']) for f in crew.get('/crew/list').json())} ground jobs={len(ground.get('/ground/queue').json())} authority requests={len(authority.get('/authority/requests').json())}")
print(f"       passenger messages={[m['template'] for m in pax.get('/me/feed').json()]}")

print("3b. Email (local test inbox)")
def inbox():
    found = httpx.get("http://localhost:8025/api/v1/search", params={"query": f"to:test-{suffix}@example.com"}, timeout=10).json()
    alerts = [m for m in found.get("messages") or [] if "confirm" not in m["Subject"]]
    return alerts or None
mails = wait_for(inbox, 20)
check(bool(mails), "the passenger's alert arrived as an email")
detail = httpx.get(f"http://localhost:8025/api/v1/message/{mails[0]['ID']}", timeout=10).json()
names = [a["FileName"] for a in detail.get("Attachments", [])] + [a.get("FileName", "") for a in detail.get("Inline", [])]
print(f"       {len(mails)} email(s); latest subject: {detail['Subject']!r}; attachments: {names}")
check("dxb-route.svg" in names, "the email carries the vector route map")
check(len(detail.get("Inline", [])) == 1, "and shows it inline as an image")

print("4. Health")
health = admin.get("/admin/health").json()
print("       " + ", ".join(f"{name}={'ok' if s['ok'] else 'DOWN (' + s['detail'] + ')'}" for name, s in health["services"].items()))
print(f"       breakers={[(b['name'], b['state']) for b in health['breakers']]} outbox_pending={health['outbox_pending']} dead_events={health['dead_events']}")
for name in ("postgres", "redis", "redpanda", "rabbitmq"):
    check(health["services"][name]["ok"], f"{name} healthy")

print("5. Privacy: export, withdraw, erase")
data = pax.get("/me/data").json()
check(data["profile"]["name"] == "Test Passenger" and data["itineraries"][0]["assistance"] == "wheelchair", "export returns everything held, decrypted")
after = pax.post("/me/consent/withdraw", json={"purpose": "assistance"}).json()
check(any(c["purpose"] == "assistance" and c["withdrawn_at"] for c in after["consents"]), "assistance consent withdrawn")
check(pax.get("/me/connection").json()["assistance"] is None, "assistance need deleted on withdrawal")
check(pax.delete("/me").status_code == 204, "delete everything")
check(pax.get("/me").status_code == 401, "session is gone")
check(len(admin.get("/admin/audit?limit=50").json()) > 5, "audit log recorded the staff and privacy actions")
print("All checks passed.")
