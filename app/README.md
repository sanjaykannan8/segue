# Segue

Flight trackers watch planes. Segue watches your connection.

One engine scores every flight connection once, decides what each person should do, and delivers it to the passenger, the ops controller, the cabin crew, the ground handler and the airport authority. Design: `../Segue_Technical_Solution.md`. API: `docs/api.md`. Privacy: `docs/data-map.md`.

## Run it

Needs Docker Desktop running, your clef-flash server reachable, and an AirLabs key.

```bash
python scripts/init_env.py
```

Open `.env` and set `AIRLABS_API_KEY`. Check `MODEL_BASE_URL` points at your clef-flash server.

```bash
docker compose up --build
```

| Screen | URL | Who |
|---|---|---|
| Passenger app | http://localhost:3000 | Anyone, after consent |
| Staff login | http://localhost:3000/login | `ops@`, `crew@`, `ground@`, `authority@`, `admin@segue.local` |
| Control panel | http://localhost:3000/console | `admin@segue.local` |
| Demo walkthrough | http://localhost:3000/demo | `admin@segue.local` |
| Test inbox (emails Segue sends) | http://localhost:8025 | This machine only |
| API docs | http://localhost:8000/docs | This machine only |
| RabbitMQ management | http://localhost:15672 | user `segue`, password `RABBIT_PASSWORD` in `.env` |

Each staff role has its own password: `SEED_PASSWORD_OPS`, `SEED_PASSWORD_CREW`, `SEED_PASSWORD_GROUND`, `SEED_PASSWORD_AUTHORITY` and `SEED_PASSWORD_ADMIN` in `.env`. Staff can change it, or sign out everywhere, on the Account page.

## Try it

1. Open the passenger app, pick a language (English, Arabic, Hindi or Tamil), read the notice, give consent, and add two flights that connect at Dubai International (DXB): one landing there, one leaving. Add an email address to get alerts with a route map: Segue emails a 6-digit code first (it lands in the test inbox), and sends alerts only after you type it in.
2. Log in as `admin@segue.local`, open the control panel, pick the inbound flight and inject a delay.
3. Watch the passenger's status change, a suggestion appear for `ops@`, and rows appear for `crew@` and `ground@`.
4. On the control panel, force the `model` breaker open: ops shows degraded mode and nothing is automated. Set it back to auto and the connections are re-scored.

## How it is built

```
app -> Redpanda -> engine (risk cached in Redis, decisions from clef-flash)
                     -> Postgres (decision + outbox, one transaction)
                     -> relay -> RabbitMQ -> consumers -> each audience's screen
```

| Service | What it does |
|---|---|
| `api` | REST and live updates (server-sent events) |
| `engine` | Scores connections, asks the model, writes decisions and outbox rows together |
| `relay` | Publishes outbox rows to RabbitMQ with confirms |
| `consumers` | Delivers each queue to its audience exactly once; retries, then dead-letters |
| `poller` | Polls AirLabs for tracked flights within the query budget |
| `privacy` | Erases personal data 24 hours after the trip |

Segue covers connections at Dubai International. Transfer times between concourses A, B, C, D and F come from `config/airports/DXB.yaml`; `docs/dxb-facts.md` lists which values are from published sources and which are estimates.

## Security and privacy

- Staff sign in with a role (ops, crew, ground, authority, admin). The role is in a signed token (JWT, HS256) kept in an httpOnly cookie; every staff route names the roles allowed to use it.
- Staff see masked names only (`P***a S***a`). An assistance need is stored encrypted and shown to ops, crew and ground only, never to the authority.
- Passengers give consent per purpose and can export, correct or delete their data. Everything personal is erased 24 hours after the onward flight.
- `docs/security-review.md` lists 27 review findings and what was done about each. `docs/data-map.md` lists every field held.

## Benchmark

`docs/benchmark.md` has measured throughput with the real model and with the model taken out, on one and three engines. It uses no flight API query.

## Tests

```bash
cd backend
uv run pytest
```

The tests need no Docker. They prove: risk is computed once per connection version; decisions are never cached; a repeated event creates nothing new; costly actions wait for a person; a model outage falls back to rules with no automation; assistance data needs consent and never reaches the authority; export, erasure and retention work.
