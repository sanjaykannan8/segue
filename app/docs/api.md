# Segue API contract

Base URL: `http://localhost:8000` (env `NEXT_PUBLIC_API_URL` in the web app). JSON in and out. Sessions are httpOnly cookies, so the browser must send `credentials: "include"`. Times are ISO 8601 UTC. Errors are `{"detail": "message"}` with a 4xx or 5xx status.

Risk levels: `safe`, `tight`, `at_risk`, `lost`. Purposes: `tracking` (required), `notifications`, `assistance`, `authority_share`.

## Shared shapes

```ts
type Flight = {
  id: string; flight_iata: string; date: string;        // date = YYYY-MM-DD of scheduled departure
  origin: string; dest: string;                         // IATA airport codes
  sched_dep: string | null; est_dep: string | null;
  sched_arr: string | null; est_arr: string | null;
  dep_terminal: string | null; dep_gate: string | null;
  arr_terminal: string | null; arr_gate: string | null;
  status: string;                                       // scheduled | en-route | landed | cancelled | unknown
  delay_min: number; version: number;
  updated_at: string; age_sec: number;                  // how old the status is
  source: "airlabs" | "manual";
};

type Risk = {
  level: "safe" | "tight" | "at_risk" | "lost";
  left_min: number;        // minutes between landing and outbound gate close
  needed_min: number;      // minutes the transfer needs
  buffer_min: number;      // left - needed
  confidence: number;      // 0..1
  probabilities: Record<string, number>;
  source: "model" | "rules";   // "rules" = degraded mode (model unavailable)
  version: string; computed_at: string;
};

type ConnectionView = {
  itinerary_id: string; connection_id: string; airport: string;
  inbound: Flight; outbound: Flight; seat: string | null;
  risk: Risk | null;                 // null until the engine has scored it
  my_buffer_min: number | null;      // buffer after this passenger's own adjustment
  steps: { id: "deplane" | "walk" | "queue" | "gate"; label: string; minutes: number }[];
  assistance: { type: string } | null;
  degraded: boolean;
};

type FeedItem = { id: string; template: string; title: string; body: string; level: string | null; created_at: string };
```

## Passenger (anonymous session cookie, set by `POST /consent`)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/notice?lang=en` | | `{version, lang, title, intro, sections: [{heading, body}], purposes: [{id, title, description, required}], retention_hours, grievance_contact}` |
| POST | `/consent` | `{notice_version, purposes: string[], language, adult: true, name?, phone?}` | `{principal_id, purposes}` and sets the cookie. 400 if `tracking` is missing or `adult` is not true |
| GET | `/me` | | `{principal_id, language, name, phone, consents: [{purpose, granted_at, withdrawn_at}], has_itinerary}`; 401 without a session |
| POST | `/flights/lookup` | `{flight_iata}` | `{flight: Flight}`; 404 if the provider has no data (then use `manual`) |
| POST | `/itineraries` | `{inbound: FlightInput, outbound: FlightInput, seat?, assistance?: "none"|"wheelchair"|"buggy"|"escort"|"step_free_route"}` | `ConnectionView` |
| GET | `/me/connection` | | `ConnectionView`; 404 if none |
| GET | `/me/feed` | | `FeedItem[]`, newest first |
| GET | `/me/stream` | | SSE. Events: `feed` (data = FeedItem), `connection` (data = `{}`; refetch `/me/connection`) |
| GET | `/me/data` | | Everything held on the person, as JSON (export) |
| PATCH | `/me/data` | `{name?, phone?, language?}` | Updated `/me` |
| POST | `/me/consent/withdraw` | `{purpose}` | Updated `/me`. Withdrawing `tracking` deletes everything and ends the session |
| POST | `/me/consent/grant` | `{purpose}` | Updated `/me` |
| POST | `/me/grievance` | `{message}` | `{id, status}` |
| POST | `/me/nominee` | `{name, contact}` | `{id, status}` |
| GET | `/me/requests` | | `[{id, type, status, opened_at, closed_at}]` |
| DELETE | `/me` | | 204; erases all personal data and clears the cookie |

`FlightInput = {flight_iata: string, manual?: {origin, dest, sched_dep, sched_arr, dep_terminal?, arr_terminal?, dep_gate?, arr_gate?}}`. `manual` is used only when lookup fails.

## Staff (cookie set by login; each route needs the role shown, `admin` may use all)

| Method | Path | Role | Returns |
|---|---|---|---|
| POST | `/auth/login` `{email, password}` | | `{email, role}` |
| POST | `/auth/logout` | | 204 |
| GET | `/auth/me` | any | `{email, role}`; 401 if not logged in |
| GET | `/ops/board` | ops | `OpsBoard` |
| POST | `/ops/decisions/{id}/approve` | ops | `OpsAction` |
| POST | `/ops/decisions/{id}/dismiss` | ops | `OpsAction` |
| GET | `/crew/list` | crew | `CrewFlight[]` |
| GET | `/ground/queue` | ground | `GroundJob[]` |
| POST | `/ground/jobs/{id}/done` | ground | `GroundJob` |
| GET | `/authority/requests` | authority | `AuthorityRequest[]` |
| GET | `/staff/stream?audience=ops|crew|ground|authority` | matching role | SSE. Event `refresh` (data = `{}`): refetch the list |

```ts
type OpsBoard = {
  counts: { safe: number; tight: number; at_risk: number; lost: number };   // passengers per level
  degraded: boolean;                                                        // model breaker open
  connections: {
    connection_id: string; airport: string; inbound: Flight; outbound: Flight;
    risk: Risk | null; passengers: number;
  }[];
  actions: OpsAction[];                                                     // pending first, newest first
};

type OpsAction = {
  decision_id: string; type: string;            // ops_action | crew_priority_deplane | ground_dispatch | request_fast_track | review
  answer: string;                               // e.g. hold_flight, yes, buggy
  title: string; detail: string;                // ready-to-show text
  connection_id: string; connection_label: string;   // "EK 512 → BA 108"
  seat: string | null;
  confidence: number; probabilities: Record<string, number>;
  gate: "auto" | "approval" | "human";
  status: "pending" | "approved" | "dismissed" | "executed" | "expired";
  created_at: string; decided_by: string | null;
};

type CrewFlight = { flight: Flight; items: { rank: number; seat: string | null; onward: string; onward_dest: string; buffer_min: number; level: string; assistance: string | null }[] };
type GroundJob = { id: string; kind: string; seat: string | null; from_gate: string | null; to_gate: string | null; inbound: string; outbound: string; buffer_min: number; priority: number; status: "open" | "done"; created_at: string };
type AuthorityRequest = { id: string; name: string | null; inbound: string; outbound: string; airport: string; deadline: string | null; level: string; created_at: string };
```

## Control panel (role `admin`)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/admin/health` | | `{services: Record<string, {ok: boolean, detail: string}>, breakers: [{name, state: "closed"|"open"|"half_open", failures, forced: string | null}], airlabs: {used, budget}, outbox_pending, dead_events}` |
| GET | `/admin/flights` | | `Flight[]` (all tracked) |
| POST | `/admin/events` | `{flight_id, delay_min?, dep_gate?, arr_gate?, dep_terminal?, arr_terminal?, status?}` | Updated `Flight` (version bumped, event published) |
| POST | `/admin/breaker/{name}` | `{state: "open" | "closed" | "auto"}` | Updated breaker. Names: `model`, `airlabs`, `rabbit` |
| GET | `/admin/dlq` | | `{events: [{id, topic, error, payload, created_at}], queues: [{name, messages}]}` |
| POST | `/admin/dlq/replay` | `{kind: "event", id}` or `{kind: "queue", name}` | `{replayed: number}` |
| GET | `/admin/audit?limit=100` | | `[{at, actor, role, action, object}]` |

## Flight search and moving to another device (passenger session unless noted)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/airports/search?q=delhi` | q: city or airport name, 3+ characters | `Airport[]` (up to 8, most used first). Shorter queries return `[]`. Cached for a week |
| GET | `/flights/departures?airport=DEL&to=DXB&after=<ISO>` | airport: departure IATA code; to: arrival IATA code (strongly recommended); after: optional earliest departure (default: 30 min ago) | `{flights: Departure[], truncated: boolean, window_hours: 10}`. Flights are soonest first, up to 80, cancelled and landed left out. The data covers only about the next 10 hours. Without `to`, a busy airport's reply is cut off (`truncated: true`) and mostly holds flights that already left, so always ask for a route. Cached for 10 minutes. 503 when flight data is unavailable |
| GET | `/flights/arrivals?airport=DXB` | airport: arrival IATA code | `{flights: Departure[], truncated: boolean, window_hours: 10}`: flights flying to that airport that have not landed, soonest landing first. In practice these are flights in the air or about to leave, landing over the next few hours. Cached for 10 minutes. When a flight is picked from this list send `arr_airport` only (no `dep_airport`) in its FlightInput |
| POST | `/me/link` | | `{code, expires_in}`: an 8-character one-time code, valid `expires_in` seconds (600) |
| POST | `/session/claim` | `{code}` (no session needed) | Sets the session cookie and returns `/me`. 404 if the code is wrong, used or expired; 429 after 10 tries in 10 minutes |

```ts
type Airport = { iata: string; name: string; country: string | null };
type Departure = {
  flight_iata: string; operated_by: string | null;   // operated_by: the operating flight when this number is a codeshare
  date: string; origin: string; dest: string;
  sched_dep: string | null; est_dep: string | null; sched_arr: string | null; est_arr: string | null;
  dep_terminal: string | null; dep_gate: string | null; arr_terminal: string | null; arr_gate: string | null;
  status: string;
};
```

`FlightInput` gains `dep_airport?: string` and `arr_airport?: string`. Send both (the `airport` and `to` used for the list) when the flight was picked from a `/flights/departures` list: the server then uses the row it already holds and spends no flight-data query. Each uncached airport search or departures list costs one query from a small allowance, so debounce typing and never refetch on every keystroke.
