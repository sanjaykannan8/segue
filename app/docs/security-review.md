# Segue security review

| ID | Severity | Title |
|---|---|---|
| S-01 | High | Any anonymous passenger can overwrite a real, shared flight record through "manual" entry |
| S-02 | High | Anonymous sessions can spend the whole AirLabs query allowance in seconds |
| S-03 | High | Every rate limit is keyed on a client-supplied `X-Forwarded-For` header |
| S-04 | High | Assistance need is copied in plaintext into decisions, outbox, RabbitMQ, feed and trace, and survives consent withdrawal |
| S-05 | Medium | JWT signing secret falls back to the literal `change-me` when both secret variables are absent |
| S-06 | Medium | `/claim?code=` auto-claims on page load: an attacker's link silently puts the victim in the attacker's session |
| S-07 | Medium | Fast-track request can still be approved and shown to the authority after `authority_share` is withdrawn |
| S-08 | Medium | AirLabs API key is written to the poller's logs on every query |
| S-09 | Fixed | Erasure removes unsent outbox rows; the retention worker deletes sent outbox rows, dead events, staff feed rows, and finished connections and flights after the window; the consumer drops messages for erased people; the trace expires after a day; Mailpit keeps 200 messages |
| S-10 | Reduced | 10 trip changes per session per hour; at most 600 passengers per connection; an email address gets alerts only after its owner types back a 6-digit code sent to it; 20 emails per address per hour. **Still open:** nothing proves a session belongs to a booked passenger. That needs the airline's booking system |

The table lists the ten most important findings. All 27 findings follow, ordered by severity (4 High, 9 Medium, 11 Low, 3 Info).

## Status after the fix pass (2026-10-04)

Backend tests (45) and the end-to-end script pass on the rebuilt stack after these changes.

**What is left, in short:** a forged forwarded address can still pass the web proxy (S-03, second-line limits only); the model is called over plain HTTP on the local network (S-04); sessions are not tied to a real booking (S-10); staff accounts are per role (S-11); Redpanda has no authentication and services share one `.env` (S-12); the local test inbox has no login (S-24).

| ID | Status | What changed |
|---|---|---|
| S-01 | Fixed | A flight already held is never changed by a passenger's manual entry; passenger-entered flights get source `pax` and pin nothing. Gate, terminal, airport and flight fields are pattern-checked |
| S-02 | Fixed | 40 searches per session per hour; passenger searches stop at 60% of the allowance (the rest is kept for the poller); the counter is atomic and per calendar month; "no such flight" is cached for 10 minutes; search text is validated |
| S-03 | Reduced | API port bound to `127.0.0.1`; login is limited per account, consent and device codes also have a global limit. A forwarded address can still be forged through the web proxy, so address-based limits are a second line only |
| S-04 | Fixed | The need is no longer copied into decisions, the outbox, RabbitMQ, feed rows or the trace. Staff lists read it from the encrypted table at read time, with a consent check. Withdrawal removes the ground job and triggers a re-score. **Still open:** the model is called over plain HTTP on the local network (the request holds the need but no identifier) |
| S-05 | Fixed | No default and no fallback secret; a secret under 32 bytes stops the service |
| S-06 | Fixed | The link fills in the code but the person must press the button; the code travels after `#`, so it is never sent to a server |
| S-07 | Fixed | Pending fast-track requests expire on withdrawal; approval, delivery and the authority list each re-check consent |
| S-08 | Fixed | httpx request logging silenced; errors logged by type only. **Rotate the AirLabs key**, since earlier logs held it |
| S-09 | Mostly fixed | Erasure removes unsent outbox rows; the retention worker deletes sent outbox rows, dead events and staff feed rows after the window; the consumer drops messages for erased people; the trace expires after a day; Mailpit keeps 200 messages. **Still open:** old flight and connection rows are not deleted |
| S-10 | Reduced | 10 trip changes per session per hour; 20 emails per address per hour. **Still open:** nothing proves a session belongs to a booked passenger, and the email address is not verified. Both need the airline's booking system |
| S-11 | Fixed | Each role has its own generated password (`SEED_PASSWORD_<ROLE>`); existing accounts were moved off the shared one. Staff can change their password on `/account`. **Still open:** accounts are per role, not per person |
| S-12 | Mostly fixed | API bound to localhost; backend containers run as an unprivileged user with all capabilities dropped; Redis requires a password. **Still open:** Redpanda has no authentication inside the compose network; every service gets the whole `.env` |
| S-13 | Fixed | Any state-changing request from another origin (including another port on the same host) is refused. Cookies get `Secure`, and HSTS is sent, whenever the site is reached over HTTPS |
| S-14 | Mostly fixed | Erasure ends the passenger session at once. Staff tokens carry a session version: sign out everywhere, a password change, or a reused refresh token ends every session of that person. Open live streams re-check the session every 15 seconds. **Still open:** there is no route to change a role, so that case does not arise yet |
| S-15 | Fixed | Same work for a missing account; the typed address is not stored |
| S-16 | Fixed | Length limits on inputs, 64 KB body limit, audit `limit` bounded, at most 6 live streams per session |
| S-17 | Fixed | Stricter address pattern; the header is built as exactly one recipient |
| S-18 | Fixed | Fixed three stars; words of three letters or fewer show only the first letter |
| S-19 | Fixed | `PII_KEY` accepts several keys for rotation. scrypt cost raised to N=2^17 and stored with each hash; older hashes still verify and are upgraded at next login |
| S-20 | Fixed | Document corrected; `SESSION_SECRET` removed |
| S-21 | Fixed | CSP, frame, referrer, content-type and permissions headers on the web app; `no-store` on API responses. HSTS to be added with HTTPS |
| S-22 | Fixed | Mailpit pinned by digest, uv pinned, builds use `uv.lock` with `--frozen`, tests left out of the image |
| S-23 | Fixed | Mail is not sent if credentials are set without TLS; `SMTP_TLS` added for port 465 |
| S-24 | Reduced | Message cap. The local inbox still has no login (bound to localhost) |
| S-25 | Fixed | Airport code validated; cache bounded |
| S-26 | Fixed | Exception type only |
| S-27 | Mostly done | `pip-audit` and `npm audit --omit=dev` run on 2026-10-04: no known vulnerabilities. **Still open:** the provenance of the packages `typesafe-sdk` pulls in has not been checked by hand |

The findings below are the review as written, before the fixes.

---

## Scope and method

- Static review of `backend/segue/`, `web/`, `docker-compose.yml`, the two Dockerfiles, `.env.example`, `scripts/init_env.py`, `config/airports/`, `docs/api.md`, `docs/data-map.md`, `docs/breach-procedure.md`, `backend/pyproject.toml`, `backend/uv.lock`, `web/package.json` and `web/package-lock.json`.
- Read-only checks only: file reads, searches, and reading installed library source (`next`, `httpx`, `PyJWT`) to confirm behaviour. Nothing was sent to the running system. No `.env` value was read into this report; only its key names were looked at.
- Every finding below was traced through the code path end to end unless it is marked **unconfirmed**.
- The backend was being edited while this review ran (engine, consumers, settings, a new `segue/bench.py`). Line numbers are from the files as they stood on 2026-10-04 around 00:20 local time; function names are given so each finding can still be located.

---

## High

### S-01 Anonymous passenger can overwrite a shared flight record (High)

*Justification: no login needed, changes data that drives other passengers' alerts and staff instructions, and the change is made permanent against the poller.*

- **Where:** `backend/segue/api/passenger.py` `_resolve()` lines 205-210 (`flights.upsert(db, data, "manual")`), reached from `add_itinerary()` line 315. `backend/segue/flights/service.py` `upsert()` lines 35-43 and `apply()` lines 46-68.
- **What happens:** `upsert` finds a flight by `(flight_iata, date)`. If a real row already exists, `apply(flight, data, "manual")` overwrites origin, destination, scheduled and estimated times, terminals, gates and status with the passenger's values, and records each field in `overrides`. `apply` then skips overridden fields for source `airlabs` (line 54), so the poller can never correct them.
- **Attack:** Anyone who has posted `/consent` sends `POST /itineraries` with `inbound.manual` for a real flight number and today's date, with an arrival time hours late (the destination must stay `DXB` so the request commits). Every other passenger on that flight now sees false times, and the next event re-scores their connections on false data: "rebooked" messages, crew and ground instructions, and hold suggestions to ops.
- **Fix:**
  - In `_resolve`, never let a passenger's manual entry touch an existing provider row: look the flight up first, and if a row with `source == "airlabs"` exists for that number and date, use it unchanged and ignore `manual`.
  - Create passenger-entered flights with a distinct source (`"passenger"`), and make `apply()` set `overrides` only for a source used by the admin console (`"console"`).
  - Constrain `Manual`: `dep_gate`/`arr_gate`/`dep_terminal`/`arr_terminal` as `Field(None, max_length=8, pattern=r"^[A-Za-z0-9]{1,8}$")`, `flight_iata` as `pattern=r"^[A-Za-z0-9]{3,8}$"`, `origin`/`dest` as `pattern=r"^[A-Za-z]{3}$"`.

### S-02 Anonymous sessions can drain the AirLabs allowance (High)

*Justification: one unauthenticated POST gives access; about 900 requests stop live flight data for every passenger and for the poller.*

- **Where:** `backend/segue/api/passenger.py`: `airport_search()` line 277, `departures()` line 292, `arrivals()` line 264, `lookup()` line 196, `_lookup()` line 173. `backend/segue/flights/provider.py` `AirLabs._get()` lines 56-71.
- **What happens:** The only gate on these routes is `Depends(passenger)`, and a passenger cookie is issued by `POST /consent` to anyone (`{adult: true, purposes: ["tracking"], notice_version}`; the version is public at `/notice`). Each new search string (`suggest:{query}`), airport pair (`sched:{airport}:{to}`), airport (`arr:{airport}`) or unknown flight number costs one provider query. There is no per-session or per-address limit on any of them.
- **Two further defects in `_get()`:**
  - The counter `airlabs:used` is never reset or expired anywhere in the code, so once spent it stays spent until someone deletes the Redis key by hand.
  - The check (`get`, line 61) and the increment (`incr`, line 67) are separate, so concurrent requests pass the check together and overshoot the 900 ceiling into the plan's real limit.
- **Attack:** A script calls `/airports/search?q=<random letters>` 900 times. `_lookup` then answers 503 for everyone and `poller/main.py` `tick()` returns at `BudgetSpent`, so no flight is updated again.
- **Fix:**
  - Per-session and per-address limits on all four routes, for example `await limit(f"fl:{principal_id}", 30, 3600, ...)` (after S-03 is fixed).
  - Reserve part of the budget for the poller: reject passenger-triggered queries once `used >= budget * 0.6`.
  - Make the counter atomic and periodic: `used = await redis().incr(key)`; `if used == 1: await redis().expire(key, <seconds to plan reset>)`; `if used > budget: raise BudgetSpent`, with the key including the billing month.
  - Validate `q` (`max_length=40`, letters and spaces only) and negative-cache "no such flight" answers for a few minutes.

### S-03 Rate limits trust a client-supplied `X-Forwarded-For` (High)

*Justification: defeats the login, consent and device-code limits together; it is what makes S-02 and S-10 unlimited.*

- **Where:** `backend/segue/api/deps.py` `client_address()` line 138-139. Used by `login()` (`staff.py` line 31), `give_consent()` (`passenger.py` line 148) and `claim()` (`passenger.py` line 494).
- **What happens:** The function returns the left-most value of `X-Forwarded-For`, which is whatever the client sent.
  - Through the web app: Next.js only sets the header when it is absent (`web/node_modules/next/dist/server/base-server.js` line 612, `req.headers['x-forwarded-for'] ??= ...`), so a client-sent value passes through unchanged.
  - Directly: `docker-compose.yml` line 70 publishes the API as `8000:8000` on all interfaces, so the header can be sent straight to it.
- **Attack:** Sending a different `X-Forwarded-For` on each request gives unlimited password guesses against the five known staff addresses, unlimited new passenger sessions, and unlimited guesses at device codes.
- **Fix:**
  - Stop publishing the API port (remove `ports` from `api`, or bind `127.0.0.1:8000:8000`).
  - Take the address from the connection, and accept a forwarded value only from a known proxy: run uvicorn with `--proxy-headers --forwarded-allow-ips=<web container address>` and use `request.client.host`; or read the right-most `X-Forwarded-For` entry added by your own proxy.
  - Add a limit that does not depend on the address at all: login attempts per account (`login:{email}`), and codes claimed per code prefix or globally.

### S-04 Assistance need leaves its encrypted column in plaintext and outlives withdrawal (High)

*Justification: disability-related data of real people, stored unencrypted in five places and still shown to staff after the person withdraws consent.*

`AssistanceNeed.type_enc` is encrypted. The engine decrypts it (`backend/segue/engine/core.py`, in `process_connection`) and the value then travels in clear text:

| Where it lands in plaintext | Code |
|---|---|
| `decision.payload.message.assistance` (crew decision) | `engine/core.py` line 285 payload, stored by `_decide()` line 144 |
| `decision.answer`, `decision.payload.message.kind`, `decision.payload.title` ("Send wheelchair for seat 14C") for ground dispatch | `engine/core.py` lines 296-297; `kind` is the declared need when one exists |
| `outbox.payload` (same dictionaries) | `_decide()` line 150 |
| RabbitMQ message bodies, persistent on the `rabbitdata` volume, plus retry and dead-letter queues | `relay/main.py` `publish_batch()` line 30-35 |
| `feed_item.payload` for audiences `crew` and `ground` | `consumers/main.py` `deliver()` line 49 |
| Redis `trace:log` list and `live:trace` channel: seat, flight pair and the `needs_assistance` / `assistance_type` answers | `engine/core.py` line 280 |
| The model request, sent over plain HTTP to another host | `engine/core.py` line 249 (`declared_assistance=assistance`), `core/settings.py` `model_base_url` |

`docs/data-map.md` line 35 says queues carry "pseudonymous IDs, seats and flight numbers", and `core/trace.py` says entries never hold personal data. Seat plus flight plus assistance type identifies a person on that flight.

**Withdrawal does not remove it.** `privacy/service.py` `erase_assistance()` lines 51-59 selects feed rows with `FeedItem.principal_id == principal_id`. Crew and ground rows are written with `principal_id=payload.get("principal_id")` (`consumers/main.py` line 49) and those payloads contain no `principal_id` (the `common` dictionary in the engine has only `itinerary_id`, `connection_id`, `seat`, `buffer_min`, `level`, `booking`). So the query matches nothing: the crew row keeps its `assistance` flag and the ground job keeps `kind: wheelchair`. The function also never touches `ground` `kind`, `decision` rows, `outbox` rows or queued messages, and `withdraw()` (`passenger.py` line 407) publishes no event to re-score the passenger.

- **Attack / failure:** A passenger withdraws the `assistance` consent and crew and ground staff still see the need. Anyone who reads the database, a backup, the RabbitMQ volume or Redis reads assistance needs without the Fernet key.
- **Fix:**
  - Do not put the need in messages. Send `{"itinerary_id": ..., "has_assistance": true}` at most, and let `crew_list()` / `ground_queue()` decrypt `AssistanceNeed` at read time, after checking the consent is still active (the read is already audited).
  - Keep `decision.answer` for ground dispatch to the resource (`buggy`, `bus`, `fast_track_escort`), and keep the need out of `title`/`detail`.
  - In `erase_assistance()`, match staff rows by `payload["itinerary_id"] in ids` (as `erase_principal` already does), delete or rewrite them, blank `Decision.payload` for that principal's `crew_priority_deplane` and `ground_dispatch` decisions, delete unsent `Outbox` rows for those itineraries, and publish `connection.reevaluate` so the engine issues retractions.
  - Drop the assistance answers from the trace entry, or replace them with a boolean.
  - Reach the model over TLS, or keep it on the same host / compose network.

---

## Medium

### S-05 JWT secret falls back to `change-me` (Medium)

*Justification: full admin takeover, but only when both secret variables are missing from the environment.*

- **Where:** `backend/segue/core/settings.py` line 26 (`session_secret: str = "change-me"`), line 27 and the `jwt_secret` property lines 64-65.
- **What happens:** If neither `JWT_SIGNING_SECRET` nor `SESSION_SECRET` is defined (a process started outside compose, or a hand-written `.env`), tokens are signed with `change-me`. PyJWT 2.15.1 only warns about short keys (`enforce_minimum_key_length` is false by default). An empty value fails closed (PyJWT raises `InvalidKeyError`), so copying `.env.example` unchanged does not trigger this.
- **Attack:** Sign `{"sub": "<any>", "email": "x", "role": "admin", "typ": "access", "iss": "segue", ...}` with `change-me` and send it as `segue_staff`. `staff()` reads the role from the token and never loads the user.
- **Fix:** Remove both defaults and refuse to start: in `Settings`, a validator that raises unless `jwt_signing_secret` is at least 32 bytes; delete the `session_secret` fallback. Pass `options={"enforce_minimum_key_length": True}` to `jwt.decode`/`encode`. Same treatment for `pii_key` (already fails at first use).

### S-06 Device-code link claims on page load (Medium)

*Justification: needs the victim to open a link, then captures everything they enter, including name, email and assistance need.*

- **Where:** `web/app/(passenger)/claim/page.tsx` lines 41-54 (auto-claim from `?code=`); `backend/segue/api/passenger.py` `claim()` lines 491-502; `components/segue/device-link.tsx` line 60 builds the link.
- **What happens:** Opening `/claim?code=XXXXXXXX` calls `POST /session/claim` with no user action, and the response replaces any existing `segue_pax` cookie.
- **Attack:** The attacker creates a session, makes a code, and sends the victim the link. The victim's browser is now inside the attacker's session; whatever trip, name, email, phone or assistance need the victim then enters is readable by the attacker from their own device with `GET /me/data`. A victim who already had a session loses it without warning.
- **Related:** the code travels in the query string, so it is stored by anything that logs the first request (reverse proxy, tunnel); `replaceState` only cleans the address bar afterwards. A claimed session lasts 72 hours and the original holder has no way to list or end it.
- **Fix:** Prefill the code but require the button press; if `GET /me` shows an existing session, ask before replacing it. Put the code in the fragment (`/claim#code=`) so it is never sent to a server. After a claim, notify the first device on its stream (`notify("pax", "linked", principal_id=...)`) and offer "end other devices" (a per-principal token version stored in Redis and checked in `passenger()`).

### S-07 Fast-track sharing survives withdrawal of `authority_share` (Medium)

*Justification: personal data reaches a third party after consent was withdrawn; needs an ops approval in between.*

- **Where:** `backend/segue/api/staff.py` `_decide()` lines 105-117; `backend/segue/api/passenger.py` `withdraw()` lines 414-415; `backend/segue/consumers/main.py` `deliver()` lines 38-49.
- **What happens:** A `request_fast_track` decision waits for ops approval. On withdrawal only existing `authority` feed rows are deleted; the pending decision stays `pending`. When ops approves it later, `_decide()` writes the outbox row without checking consent, the consumer creates the feed row, and `authority_requests()` shows the masked name and flights. The same gap exists for a message already in the outbox or RabbitMQ at the moment of withdrawal: `deliver()` never checks consent for any audience (including `pax` after `notifications` is withdrawn, where the email address is already gone but the feed row is recreated).
- **Fix:** In `withdraw()`, expire pending decisions of the affected type (`update(Decision).where(principal_id == ..., type == "request_fast_track", status == "pending").values(status="expired")`). In `staff._decide()` and in `consumers.deliver()`, re-read active consents for `payload["principal_id"]` / the itinerary's principal and drop the action if the purpose is no longer granted. In `authority_requests()`, filter rows by a live `authority_share` consent.

### S-08 AirLabs API key written to logs (Medium)

*Justification: a paid credential in container logs that are readable by anyone with Docker access and are usually shipped elsewhere.*

- **Where:** `backend/segue/flights/provider.py` line 66 (key sent as the `api_key` query parameter); `backend/segue/poller/main.py` `main()` line 63 (`logging.basicConfig(level=logging.INFO)`), lines 52 and 71 (`%r` of the exception).
- **What happens:** httpx 0.28.1 logs every request at INFO with the full URL (`httpx/_client.py` line 1741, `'HTTP Request: %s %s ...'`), and the poller sets the root logger to INFO, so each poll logs the URL with the key. `repr()` of an `httpx.HTTPStatusError` also contains the full URL. The API process does not call `basicConfig`, so it is not affected at default uvicorn settings. (Confirmed by reading the code; the live logs were not inspected.)
- **Fix:** `logging.getLogger("httpx").setLevel(logging.WARNING)` and the same for `httpcore` in every service; log `type(error).__name__` instead of `%r` in the poller, as the mailer and engine already do. AirLabs only accepts the key in the query string, so also rotate the key once this is fixed.

### S-09 Erasure and retention leave personal data behind (Medium)

*Justification: breaks the 24-hour deletion promise in the notice (DPDP storage limitation and erasure).*

`privacy/service.py` `erase_principal()` (lines 62-81) and `privacy/main.py` `purge()` (lines 17-31) do not cover:

- **`outbox`**: rows are never deleted (the only `delete(Outbox)` is in `segue/bench.py`). Payloads hold `principal_id`, `itinerary_id`, seat, flights and, per S-04, assistance.
- **RabbitMQ**: messages waiting in queues, retry queues and `*.dlq` are untouched, and `deliver()` will recreate a feed row for an erased person (`consumers/main.py` line 34 handles `pii is None` and carries on).
- **`decision`**: `answer` and `type` are kept after erasure "for analytics"; for ground dispatch `answer` is the assistance type.
- **Redis**: `trace:log` (seats, flights, assistance answers) has no expiry and is only cleared by the demo buttons; `metrics:*` lists keep up to 200,000 entries.
- **`dead_event`**: never purged; payloads hold itinerary and connection IDs.
- **`rights_request`**: a still-valid passenger token after erasure can add grievance or nominee rows (`passenger.py` lines 435-448 do not check the principal exists) that no later purge matches.
- **Staff `feed_item` rows**: created without `expires_at` (`consumers/main.py` line 49), so they fall under the 2-day rule, not the 24-hour one.
- **Mailpit**: holds the address and text of every email sent, with no deletion.
- **`flight_instance` / `connection`**: never deleted, so the tables and the ops board grow without bound.
- **Fix:** In `erase_principal`, delete outbox rows whose payload names the principal or its itineraries; in `purge()`, delete sent outbox rows older than a day, dead events older than the retention window, and flights/connections with no itinerary. In `deliver()`, drop the message when the principal or itinerary no longer exists. Give `trace:log` a TTL (`expire` after `lpush`). Make `/me/grievance` and `/me/nominee` return 401 when `PassengerPII` is gone. Set `expires_at` on staff feed rows from the outbox row's expiry. Start Mailpit with `--max 200` or purge it on a timer.

### S-10 Unverified passengers drive staff work, model calls and email without limit (Medium)

*Justification: no login needed; the effects are operational noise, degraded mode for everyone and third-party email, not data disclosure.*

- **Where:** `backend/segue/api/passenger.py` `add_itinerary()` lines 310-343 (no limit), `give_consent()` line 148 (limit bypassed per S-03), `correct()` lines 386-389 and `give_consent()` line 159 (email stored unverified); `backend/segue/engine/core.py` `process_connection()`; `backend/segue/consumers/main.py` line 59.
- **What happens and what an attacker can do:**
  - Nothing proves a session belongs to someone on the flight. A script can add many sessions to a real connection, each with a seat and a self-granted `assistance` consent. Decisions with confidence of 0.85 or more run by themselves, so cabin crew get "call seat X off first" and ground staff get dispatch jobs for people who do not exist, and the inflated passenger count pushes the model toward suggesting a hold.
  - Each `POST /itineraries` triggers up to three model calls. Three timeouts open the shared `model` breaker (`core/breaker.py`, threshold 3) and the whole system drops to fixed rules. Each call also creates flight and connection rows that are never removed.
  - An email address is accepted without proof of ownership, and every re-posted itinerary sends it another message. Once real SMTP is configured this mails any address, as often as wanted, from the airline's sender.
- **Fix:** Limit `POST /itineraries` per session (for example 5 per hour) and total sessions per connection; cap one session to one model evaluation per flight version. Verify email with a one-time code before the first send, and cap emails per address per hour. Longer term, bind a session to a booking (boarding-pass barcode check against the airline's passenger list) before it can generate staff instructions; until then mark such decisions `approval`, not `auto`.

### S-11 One shared password for all five staff accounts, including admin (Medium)

*Justification: a single leaked or shoulder-surfed password gives every role; there is no way to change it.*

- **Where:** `backend/segue/core/migrate.py` `seed_staff()` lines 16-26; `scripts/init_env.py` line 26; `README.md` line 29.
- **What happens:** `ops@`, `crew@`, `ground@`, `authority@` and `admin@segue.local` are all created with `SEED_STAFF_PASSWORD`. The authority is an outside party by design, yet its password is also the admin's. There is no password-change route, no per-person account (the audit log records the shared address), and no second factor. The value also stays in the environment of every backend container.
- **Fix:** Generate one password per role in `init_env.py` (`SEED_PASSWORD_OPS`, ...), pass them only to the `migrate` service, add `POST /auth/password`, and force a change on first login. Add named accounts before real staff use it.

### S-12 API reachable directly on all interfaces; backend containers run as root (Medium)

*Justification: widens every other finding and removes a layer of containment.*

- **Where:** `docker-compose.yml` line 70 (`ports: ["8000:8000"]`), line 96 (`3000:3000`); `backend/Dockerfile` (no `USER`).
- **What happens:** The API is published on every network interface, not only through the web app, so the "same-origin, no CORS" design is bypassed and `X-Forwarded-For` can be sent directly (S-03). The six Python services run as root inside their containers; `web/Dockerfile` correctly switches to an unprivileged user.
- **Other compose observations (lower weight):** Redis, Redpanda and RabbitMQ traffic inside the compose network is unauthenticated (Redis, Redpanda) and unencrypted (all); none of those ports is published, which is correct. Every backend service receives the whole `.env` (PII key, JWT secret, SMTP and AirLabs credentials), although the relay and poller need neither the PII key nor the JWT secret. Redis is persisted (`--appendonly yes`) and holds refresh-token IDs, device codes and the trace.
- **Fix:** Remove the `api` port mapping (or bind to `127.0.0.1`). Add to `backend/Dockerfile`: `RUN useradd -r -u 10001 segue` and `USER segue` (and `read_only: true`, `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]` in compose). Set `--requirepass` on Redis and put the password in `REDIS_URL`. Split `.env` so each service gets only what it uses.

### S-13 No CSRF defence beyond `SameSite=Lax`, and cookies are not `Secure` by default (Medium)

*Justification: the only barrier is one cookie attribute; several state-changing routes take no body at all.*

- **Where:** `backend/segue/api/deps.py` `_set()` line 56; `core/settings.py` line 31 (`cookie_secure: bool = False`); `api/main.py` line 21.
- **What happens:** There is no CSRF token and no `Origin`/`Sec-Fetch-Site` check. JSON routes get some protection from FastAPI refusing non-JSON content types, but these routes take no body and so accept a plain cross-origin form post if the cookie is sent: `POST /ops/decisions/{id}/approve`, `/dismiss`, `/ground/jobs/{id}/done`, `/admin/demo/run`, `/admin/demo/reset`, `/me/link`, `/auth/logout`, `DELETE /me`. `SameSite=Lax` stops other sites, but not other origins on the same site: another port on the same host (Mailpit on 8025 renders attacker-influenced email HTML; RabbitMQ on 15672) or a sibling subdomain in a real deployment. With `COOKIE_SECURE=false` the cookies are also sent over plain HTTP.
- **Fix:** Add a small middleware in `api/main.py` that rejects any non-GET request whose `Origin` (or `Sec-Fetch-Site`) is present and not in `web_origin`. Use the `__Host-` cookie prefix with `secure=True` whenever the site is not `localhost`, and make `cookie_secure` default to true.

---

## Low

### S-14 Staff session lifecycle gaps (Low)

*Justification: short windows and limited impact, but each is a real deviation from the stated design.*

- **Where:** `backend/segue/api/deps.py` `staff()` lines 114-126, `_refresh()` lines 99-111, `revoke_staff()` lines 78-87, `sse()` lines 142-160.
- **Details:**
  - A role change or account deletion takes effect only when the access token expires (up to 15 minutes): `staff()` trusts the role in the token and never loads the user.
  - A replayed refresh token is simply refused; the legitimate session that followed it is not revoked, so theft is not detected.
  - Logout revokes only the tokens in that browser; there is no "sign out everywhere".
  - An open `/staff/stream` or `/admin/trace/stream` keeps running after logout or expiry: the check happens once, at connect.
  - Passenger tokens last 72 hours with no revocation list. After `DELETE /me` a copied token still passes `passenger()` and can call the flight-lookup routes (S-02).
- **Fix:** Keep a per-user `session_version` in Redis, put it in both tokens and compare it in `staff()`; bump it on role change, deletion and "sign out everywhere". On refresh reuse, bump it. Re-check the token in the SSE loop every heartbeat. For passengers, check the principal exists in `passenger()` (one indexed read) or keep a `pax_revoked:{id}` key.

### S-15 Login timing reveals which staff addresses exist; failed logins write attacker-controlled audit rows (Low)

- **Where:** `backend/segue/api/staff.py` `login()` lines 34-38.
- **What happens:** `verify_password` (scrypt) runs only when the account exists, so a missing account answers measurably faster. Each failure inserts an `audit_log` row whose `actor` is the first 64 characters of the submitted "email": unlimited rows (with S-03), and a password typed into the wrong field is stored in clear.
- **Fix:** When the user is missing, run `verify_password(body.password, DUMMY_HASH)` anyway. Store a keyed hash of the attempted address, not the text, and cap failures recorded per minute.

### S-16 Unbounded inputs (Low)

- **Where and what:**
  - `passenger.py` `ConsentIn.purposes` (any length list), `ConsentIn.notice_version`, `PurposeIn.purpose`, `ProfileIn.language`: no length limits.
  - `passenger.py` `Manual` terminals and gates: no limit; values longer than 8 characters reach Postgres and return a 500.
  - `staff.py` `LoginIn.email` / `password`: no limit; the email becomes part of a Redis key.
  - `passenger.py` `airport_search(q)`: no maximum length; each distinct value is cached for a week (`suggest:{query}`), so Redis memory can be filled.
  - `admin.py` `audit_log(limit)`: a negative value gives `LIMIT -1` and a 500. `EventIn` strings are unbounded (admin only).
  - `deps.py` `sse()`: no cap on concurrent streams per session; each holds a Redis connection.
  - No request body size limit is set on uvicorn or in Next's proxy.
- **Fix:** `Field(max_length=...)` / `conlist(str, max_length=8)` on each; `limit: int = Query(100, ge=1, le=500)`; a per-session stream counter in Redis; a body-size middleware (for example 64 KB).

### S-17 Email recipient validation is loose (Low)

- **Where:** `backend/segue/api/passenger.py` `EMAIL_PATTERN` line 28; `backend/segue/consumers/mailer.py` `build()` line 41 (`message["To"] = to`).
- **What happens:** The pattern forbids whitespace and a second `@`, so CR/LF header injection is not possible (and `EmailMessage` would raise on it). It does allow commas, semicolons, quotes and angle brackets, so `a@b.co,postmaster` is parsed as two recipients by the mail library.
- **Fix:** Tighten to `^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$` and build the header with `email.headerregistry.Address(addr_spec=to)`.

### S-18 Name masking leaks short names and name length (Low)

- **Where:** `backend/segue/core/util.py` `mask_name()` lines 58-65.
- **What happens:** One-letter words are shown whole, two-letter words show half ("Li" becomes "L*"), three-letter words show two of three letters ("Ali" becomes "A*i"), and the number of stars equals the hidden letters. For short names, common in the passenger population here, the mask is close to the name, and this is what the outside authority receives.
- **Fix:** Show the first letter and a fixed number of stars per word (`word[0] + "***"`), whatever the length.

### S-19 Key management: one Fernet key, no rotation path; scrypt cost is low (Low)

- **Where:** `backend/segue/core/util.py` `_fernet()` lines 12-16, `hash_password()` lines 38-41.
- **What happens:** A single key encrypts everything and there is no way to introduce a new one without re-encrypting in one step; `docs/breach-procedure.md` asks for rotation. scrypt uses `n=2**14`, below current OWASP guidance (`2**17`, r=8, p=1).
- **Fix:** Accept a comma-separated `PII_KEYS` and use `MultiFernet([Fernet(k) for k in keys])` (encrypts with the first, decrypts with any). Raise `n` to `2**17` and store the parameters in the hash string so old hashes still verify.

### S-20 Breach procedure names the wrong secret (Low)

- **Where:** `docs/breach-procedure.md` line 8; `backend/segue/core/settings.py` lines 64-65.
- **What happens:** The procedure says rotating `SESSION_SECRET` ends all sessions. Tokens are signed with `JWT_SIGNING_SECRET` whenever it is set (it is generated by `init_env.py`), so rotating `SESSION_SECRET` alone leaves every stolen token valid.
- **Fix:** Correct the document to `JWT_SIGNING_SECRET`, and remove `SESSION_SECRET` from the code (see S-05).

### S-21 No security headers on the web app or API (Low)

*Justification: no XSS sink was found, and Lax cookies are not sent into cross-site frames, so this is defence in depth.*

- **Where:** `web/next.config.ts` (no `headers()`), no `middleware.ts`/`proxy.ts`; `backend/segue/api/main.py`.
- **What happens:** No `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` or `Permissions-Policy` is sent.
- **Fix:** Add `async headers()` in `next.config.ts` for `/(.*)` with `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (add a nonce for scripts), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self)` (the pass scanner uses the camera), and HSTS once on HTTPS. Add `Cache-Control: no-store` to API responses that carry personal data (`/me`, `/me/data`, staff lists).

### S-22 Images and Python dependencies are not reproducibly pinned (Low)

- **Where:** `docker-compose.yml` line 55 (`axllent/mailpit:latest`); `backend/Dockerfile` line 2 (`ghcr.io/astral-sh/uv:latest`), lines 7-10.
- **What happens:** Two images float on `latest`. The first `uv sync` copies only `pyproject.toml`, not `uv.lock`, so it resolves the newest versions allowed by the `>=` ranges; the second runs without `--frozen`, so the lock can be rewritten at build time. `backend/` has no `.dockerignore`, so `.venv`, `tests` and caches are copied into the image.
- **Fix:** Pin tags (ideally digests). `COPY pyproject.toml uv.lock ./` then `uv sync --frozen --no-dev --no-install-project`, and `uv sync --frozen --no-dev` after the source copy. Add `backend/.dockerignore` (`.venv`, `tests`, `.pytest_cache`, `__pycache__`, `*.egg-info`).

### S-23 SMTP credentials can be sent without TLS (Low)

- **Where:** `backend/segue/consumers/mailer.py` `send()` line 77; `core/settings.py` `smtp_starttls: bool = False`.
- **What happens:** With a real provider configured and `SMTP_STARTTLS` left at its default, the username, password and every passenger email go in clear text. There is no option for implicit TLS (port 465).
- **Fix:** Refuse to send credentials without TLS: if `smtp_user` is set and neither STARTTLS nor `use_tls` is on, raise at start-up. Add `smtp_tls: bool` mapped to `use_tls`.

### S-24 Mailpit inbox holds real addresses and messages with no authentication (Low)

- **Where:** `docker-compose.yml` lines 54-57.
- **What happens:** The UI is bound to `127.0.0.1:8025`, which is correct, but it has no login: any local user or process (and any page that can reach localhost) can read every passenger email. See also S-09 and S-13.
- **Fix:** Start it with `--ui-auth-file` and a message cap, and do not run it at all when real SMTP is configured (a compose profile).

---

## Info

### S-25 Airport config path is built from an unvalidated code (Info)

- **Where:** `backend/segue/core/buffer.py` `airport_config()` lines 34-41.
- **What happens:** `Path(airports_dir) / f"{airport.upper()}.yaml"` would accept `../X`. It is not reachable today: `Connection.airport` is only ever set from `inbound.dest` after the `HUB` check in `add_itinerary()` (line 317) or the literal `"DXB"` in the demo. `yaml.safe_load` is used, so the worst case would be reading another `.yaml` file. The `lru_cache` is unbounded.
- **Fix:** `if not re.fullmatch(r"[A-Z]{3,4}", airport.upper()): return dict(DEFAULT)` and `@lru_cache(maxsize=64)`.

### S-26 Admin responses include raw exception text (Info)

- **Where:** `backend/segue/api/admin.py` `_check()` line 57, `dead_letters()` line 168; `engine/main.py` (stores `repr(error)` in `dead_event.error`); `consumers/main.py` line 76 (`x-error` header).
- **What happens:** Exception messages are returned to the admin console and stored. Whether any of them can contain a connection string with its password (for example a RabbitMQ or database connect error) is **unconfirmed**; it depends on the driver's message.
- **Fix:** Return `type(error).__name__` only, as `_model_health()` already does.

### S-27 Dependency notes (Info, partly unconfirmed)

- **Read:** `backend/pyproject.toml`, `backend/uv.lock`, `web/package.json`, `web/package-lock.json`. No install or audit tool was run.
- **Locked versions are current:** fastapi 0.142.2, starlette 1.7.0, pyjwt 2.15.1, cryptography 50.0.2, httpx 0.28.1, aiosmtplib 5.1.3, sqlalchemy 2.1.3, pyyaml 6.0.3; next 16.3.8, react 19.3.0. I know of no published vulnerability in these exact versions, but this is **unconfirmed**: run `uv pip audit` (or `pip-audit`) and `npm audit` in CI.
- **All ranges are open-ended** (`>=` in Python, `^` in npm). The lock files protect a build only if they are used (see S-22).
- **`typesafe-sdk` 0.7.2** pulls in `httpx2`, `httpcore2` and `httpx2-jsfetch`, alongside the well-known `httpx` and `httpcore`. All four come from pypi.org. These near-namesake packages are not ones I can vouch for; their provenance is **unconfirmed** and worth a manual check before real data flows through the service that loads them (the engine, which also holds the PII key).
- **`psycopg2-binary`** is used only for migrations; fine for a prototype, the project's own advice is to build `psycopg2` from source for production.

---

## Checked and found correct

**Authentication**
- JWT verification pins `algorithms=["HS256"]`, requires `exp`, `iat`, `sub`, `jti`, checks the issuer and a `typ` claim per token kind, so a passenger or refresh token cannot be used as a staff access token and `alg: none` / algorithm confusion is not possible (`deps.py` `_decode()`).
- Refresh tokens are single use through an atomic `GETDEL`; logout deletes the refresh record and deny-lists the access token for its remaining life.
- Cookies are `HttpOnly`, `SameSite=Lax`, path `/`. No token is kept in browser storage or exposed to scripts; no `localStorage`/`sessionStorage` use in the web app.
- Login returns the same message and status for an unknown account and a wrong password. `/session/claim` gives one message for wrong, used and expired codes.
- Device codes come from `secrets.choice`, 8 characters from 31 (about 40 bits), 10-minute life, single use by `GETDEL`.
- Passwords are salted scrypt with constant-time comparison.

**Authorisation**
- Every route in `staff.py` and `admin.py` carries a role dependency, and the roles match `docs/api.md`: ops board and decisions (`ops`), crew list (`crew`, `ops`), ground queue (`ground`, `ops`), job done (`ground`), authority list (`authority`), all `/admin/*` including the demo and trace routes (`admin`). `/staff/stream` checks the requested audience against the role.
- No passenger route takes an object ID: every query is filtered by the `principal_id` from the token, so there is no IDOR on trips, feeds, exports, requests or streams.
- The authority route returns a fixed set of fields (masked name, flights, airport, deadline, level). The fast-track payload built in the engine carries no assistance data and no seat. Fast-track always waits for ops approval.
- No staff route returns an unmasked name, phone or email. Reads of staff lists are written to the audit log.
- Consent is checked before storing an assistance need and before storing an email address.

**Injection and input handling**
- All database access is SQLAlchemy ORM / Core with bound parameters; the only raw SQL is the constant `select 1`. Migrations contain no string-built SQL.
- Email HTML: title, body, route line, map `alt` text and link are all passed through `html.escape`. Subject and To cannot carry CR/LF (`EmailMessage` raises). Template text is fixed; user values are only substituted as `str.format` arguments.
- Route map SVG: gate strings and the route description are escaped with `html.escape` (quotes included) in `dxbmap.py`; gate lookups use a dictionary. No injection path found.
- No user-supplied URL or host is ever fetched: the AirLabs base URL is constant and parameters go through httpx's encoder. No SSRF path found.
- YAML is read with `yaml.safe_load`; there is no `pickle`, `eval` or `exec`. JSON only elsewhere.
- Regular expressions: the email pattern runs in pydantic's linear-time engine; `seat_row` uses a trivial anchored pattern. No ReDoS found.

**Web**
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or script-URL sinks. API strings are rendered as React text.
- All redirects (`router.replace`/`push`) go to fixed paths; no open redirect. The `code` query value is stripped to `[A-Z0-9]{8}` before use.
- The only `NEXT_PUBLIC_*` value is the API path (`/api`). No secret is referenced from client code; `API_INTERNAL_URL` is used only in the server-side rewrite.
- CORS names explicit origins from `WEB_ORIGIN`; no wildcard with credentials.
- `X-Powered-By` is disabled. The web container runs as an unprivileged user.

**Secrets and infrastructure**
- `.env` is git-ignored; `init_env.py` generates strong random values and does not print them; `.env.example` contains no real values. Compose takes the Postgres and RabbitMQ passwords from `.env` (no default credentials; RabbitMQ's `guest` account is replaced).
- Postgres, Redis and Redpanda publish no host ports. The RabbitMQ management UI and Mailpit are bound to `127.0.0.1`.
- Postgres, Redis, Redpanda, RabbitMQ, Node and Python base images carry version tags.
- Name, phone, email, assistance type and grievance text are Fernet-encrypted at rest in their own columns; a missing key stops the service instead of storing clear text.
- The model SDK's logger is set to WARNING; the engine and mailer log exception class names, not payloads or addresses. The model state holds no name, phone, ID or seat.
- Hold, rebook and fast-track actions never run without a person, whatever the model's confidence.
