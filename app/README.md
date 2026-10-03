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
| API docs | http://localhost:8000/docs | |
| RabbitMQ management | http://localhost:15672 | user `segue`, password `RABBIT_PASSWORD` in `.env` |

The staff password is `SEED_STAFF_PASSWORD` in `.env`.

## Try it

1. Open the passenger app, read the notice, give consent, and add two connecting flights (for example an inbound landing at an airport and an outbound leaving it).
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

Walking and queue times come from `config/airports/<IATA>.yaml`. Add a file for each airport you test.

## Tests

```bash
cd backend
uv run pytest
```

The tests need no Docker. They prove: risk is computed once per connection version; decisions are never cached; a repeated event creates nothing new; costly actions wait for a person; a model outage falls back to rules with no automation; assistance data needs consent and never reaches the authority; export, erasure and retention work.
