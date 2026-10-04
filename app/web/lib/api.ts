"use client";

/**
 * Typed client for the Segue API (see app/docs/api.md, the single source of truth).
 * Sessions are httpOnly cookies, so every request sends credentials.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api").replace(/\/+$/, "");

/* ───────────── Shared shapes (copied from the contract) ───────────── */

export type RiskLevel = "safe" | "tight" | "at_risk" | "lost";
export type Purpose = "tracking" | "notifications" | "assistance" | "authority_share";
export type Language = "en" | "ar" | "hi" | "ta";
export type AssistanceType = "none" | "wheelchair" | "buggy" | "escort" | "step_free_route";

export type Flight = {
  id: string; flight_iata: string; date: string;
  origin: string; dest: string;
  sched_dep: string | null; est_dep: string | null;
  sched_arr: string | null; est_arr: string | null;
  dep_terminal: string | null; dep_gate: string | null;
  arr_terminal: string | null; arr_gate: string | null;
  status: string;
  delay_min: number; version: number;
  updated_at: string; age_sec: number;
  source: "airlabs" | "manual";
};

export type Risk = {
  level: RiskLevel;
  left_min: number;
  needed_min: number;
  buffer_min: number;
  confidence: number;
  probabilities: Record<string, number>;
  source: "model" | "rules";
  version: string; computed_at: string;
};

export type Booking = "single_ticket" | "separate_tickets";
/** Known step ids; the API may add more, and any id renders. */
export type StepId = "deplane" | "walk" | "queue" | "gate" | "recheck" | (string & {});

export type ConnectionView = {
  itinerary_id: string; connection_id: string; airport: string;
  inbound: Flight; outbound: Flight; seat: string | null;
  risk: Risk | null;
  my_buffer_min: number | null;
  steps: { id: StepId; label: string; minutes: number }[];
  assistance: { type: string } | null;
  degraded: boolean;
  booking?: Booking;
};

export type FeedItem = { id: string; template: string; title: string; body: string; level: string | null; created_at: string };

/* ───────────── Passenger ───────────── */

export type NoticePurpose = { id: Purpose; title: string; description: string; required: boolean };
export type Notice = {
  version: string; lang: string; dir?: "rtl" | "ltr"; title: string; intro: string;
  sections: { heading: string; body: string }[];
  purposes: NoticePurpose[];
  retention_hours: number; grievance_contact: string;
};

export type ConsentBody = { notice_version: string; purposes: Purpose[]; language: Language; adult: true; name?: string; phone?: string; email?: string };
export type ConsentResult = { principal_id: string; purposes: Purpose[] };

export type ConsentRecord = { purpose: Purpose; granted_at: string; withdrawn_at: string | null };
export type Me = {
  principal_id: string; language: string; name: string | null; phone: string | null; email?: string | null; email_verified?: boolean;
  consents: ConsentRecord[]; has_itinerary: boolean;
};

export type ManualFlight = {
  origin: string; dest: string; sched_dep: string; sched_arr: string;
  dep_terminal?: string; arr_terminal?: string; dep_gate?: string; arr_gate?: string;
};
/** dep_airport and arr_airport: the `airport` and `to` of the route list the flight was picked from. */
export type FlightInput = { flight_iata: string; manual?: ManualFlight; dep_airport?: string; arr_airport?: string };

export type Airport = { iata: string; name: string; country: string | null };
export type Departure = {
  flight_iata: string; operated_by: string | null;
  date: string; origin: string; dest: string;
  sched_dep: string | null; est_dep: string | null; sched_arr: string | null; est_arr: string | null;
  dep_terminal: string | null; dep_gate: string | null; arr_terminal: string | null; arr_gate: string | null;
  status: string;
};
export type DepartureList = { flights: Departure[]; truncated: boolean; window_hours: number };
export type DeviceLink = { code: string; expires_in: number };
export type ItineraryBody = { inbound: FlightInput; outbound: FlightInput; seat?: string; assistance?: AssistanceType; booking?: Booking };

export type RequestTicket = { id: string; status: string };
export type MyRequest = { id: string; type: string; status: string; opened_at: string; closed_at: string | null };

/* ───────────── Staff ───────────── */

export type Role = "ops" | "crew" | "ground" | "authority" | "admin";
export type StaffUser = { email: string; role: Role };
export type Audience = "ops" | "crew" | "ground" | "authority";

export type OpsConnection = {
  connection_id: string; airport: string; inbound: Flight; outbound: Flight;
  risk: Risk | null; passengers: number;
};

export type OpsAction = {
  decision_id: string; type: string;
  answer: string;
  title: string; detail: string;
  connection_id: string; connection_label: string;
  seat: string | null;
  confidence: number; probabilities: Record<string, number>;
  gate: "auto" | "approval" | "human";
  status: "pending" | "approved" | "dismissed" | "executed" | "expired";
  created_at: string; decided_by: string | null;
};

export type OpsBoard = {
  counts: { safe: number; tight: number; at_risk: number; lost: number };
  degraded: boolean;
  connections: OpsConnection[];
  actions: OpsAction[];
};

export type CrewItem = { rank: number; seat: string | null; name?: string | null; onward: string; onward_dest: string; buffer_min: number; level: string; assistance: string | null; booking?: Booking };
export type CrewFlight = { flight: Flight; items: CrewItem[] };
export type GroundJob = { id: string; kind: string; assistance?: string | null; seat: string | null; name?: string | null; from_gate: string | null; to_gate: string | null; inbound: string; outbound: string; buffer_min: number; priority: number; status: "open" | "done"; created_at: string };
export type AuthorityRequest = { id: string; name: string | null; inbound: string; outbound: string; airport: string; deadline: string | null; level: string; created_at: string };

/* ───────────── Control panel ───────────── */

export type Breaker = { name: string; state: "closed" | "open" | "half_open"; failures: number; forced: string | null };
export type AdminHealth = {
  services: Record<string, { ok: boolean; detail: string }>;
  breakers: Breaker[];
  airlabs: { used: number; budget: number };
  outbox_pending: number;
  dead_events: number;
};
export type InjectEventBody = { flight_id: string; delay_min?: number; dep_gate?: string; arr_gate?: string; dep_terminal?: string; arr_terminal?: string; status?: string };
export type DeadEvent = { id: string; topic: string; error: string; payload: unknown; created_at: string };
export type Dlq = { events: DeadEvent[]; queues: { name: string; messages: number }[] };
export type DlqReplayBody = { kind: "event"; id: string } | { kind: "queue"; name: string };
export type AuditEntry = { at: string; actor: string; role: string; action: string; object: string };

export type DemoState = {
  connection_id: string; inbound: Flight; outbound: Flight; passengers: number;
  risk: { level: string; buffer_min: number; left_min: number; needed_min: number; source: "model" | "rules"; confidence: number } | null;
};
export type DemoPassenger = {
  seat: string;
  booking: Booking;
  assistance: string | null;
  level: RiskLevel | null;
  buffer_min: number;
  why: string[];
  message: { title: string; body: string; template: string; at: string } | null;
  earlier_messages: { title: string; at: string }[];
  staff: { audience: "crew" | "ground" | "authority"; text: string; state: "sent" | "waiting" | "dismissed"; note: string; decision_id: string | null; confidence: number }[];
};
export type DemoBoard = {
  story: string[];
  connection?: { inbound: Flight; outbound: Flight; left_min: number; needed_min: number; buffer_min: number; level: string | null; source: "model" | "rules" | null };
  ops: { decision_id: string; title: string; detail: string; status: "pending" | "approved" | "dismissed" | "executed"; gate: string; confidence: number; decided_by: string | null } | null;
  passengers: DemoPassenger[];
};
export type TraceStage = "event" | "buffer" | "risk" | "ops" | "passenger" | "decision" | "publish" | "deliver";
export type TraceEntry = {
  id: string; at: string; event_id: string | null;
  stage: TraceStage;
  title: string;
  detail: Record<string, unknown>;
};

/* ───────────── Fetch core ───────────── */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Status 0 means the request never reached the API (offline, API down, CORS). */
export function isStatus(error: unknown, ...statuses: number[]) {
  return error instanceof ApiError && statuses.includes(error.status);
}

/** A short, plain message for an inline error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "We can't reach Segue right now. Check your connection and try again.";
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}

function detailText(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : null)).filter(Boolean);
    return parts.length ? parts.join(". ") : null;
  }
  return null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Network error");
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data: unknown = await response.json();
      const detail = data && typeof data === "object" && "detail" in data ? detailText((data as { detail: unknown }).detail) : null;
      if (detail) message = detail;
    } catch { /* not JSON */ }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const get = <T,>(path: string) => request<T>("GET", path);
const post = <T,>(path: string, body?: unknown) => request<T>("POST", path, body);
const seg = encodeURIComponent;

/* ───────────── Endpoints ───────────── */

export const api = {
  // Passenger
  notice: (lang: Language = "en") => get<Notice>(`/notice?lang=${seg(lang)}`),
  consent: (body: ConsentBody) => post<ConsentResult>("/consent", body),
  me: () => get<Me>("/me"),
  lookupFlight: (flight_iata: string) => post<{ flight: Flight }>("/flights/lookup", { flight_iata }),
  createItinerary: (body: ItineraryBody) => post<ConnectionView>("/itineraries", body),
  myConnection: () => get<ConnectionView>("/me/connection"),
  myFeed: () => get<FeedItem[]>("/me/feed"),
  exportMyData: () => get<unknown>("/me/data"),
  updateMyData: (body: { name?: string; phone?: string; email?: string; language?: Language }) => request<Me>("PATCH", "/me/data", body),
  withdrawConsent: (purpose: Purpose) => post<Me>("/me/consent/withdraw", { purpose }),
  grantConsent: (purpose: Purpose) => post<Me>("/me/consent/grant", { purpose }),
  grievance: (message: string) => post<RequestTicket>("/me/grievance", { message }),
  nominee: (name: string, contact: string) => post<RequestTicket>("/me/nominee", { name, contact }),
  myRequests: () => get<MyRequest[]>("/me/requests"),
  deleteMe: () => request<void>("DELETE", "/me"),
  searchAirports: (q: string) => get<Airport[]>(`/airports/search?q=${seg(q)}`),
  departures: (airport: string, to: string, after?: string | null) => get<DepartureList>(`/flights/departures?airport=${seg(airport)}&to=${seg(to)}${after ? `&after=${seg(after)}` : ""}`),
  arrivals: (airport: string) => get<DepartureList>(`/flights/arrivals?airport=${seg(airport)}`),
  createLink: () => post<DeviceLink>("/me/link"),
  claimSession: (code: string) => post<Me>("/session/claim", { code }),
  verifyEmail: (code: string) => post<Me>("/me/email/verify", { code }),
  resendEmailCode: () => post<{ sent: boolean }>("/me/email/resend"),

  // Staff
  login: (email: string, password: string) => post<StaffUser>("/auth/login", { email, password }),
  logout: () => post<void>("/auth/logout"),
  logoutEverywhere: () => post<void>("/auth/logout-all"),
  changePassword: (current: string, next: string) => post<{ ok: boolean }>("/auth/password", { current, new: next }),
  authMe: () => get<StaffUser>("/auth/me"),
  opsBoard: () => get<OpsBoard>("/ops/board"),
  approveDecision: (id: string) => post<OpsAction>(`/ops/decisions/${seg(id)}/approve`),
  dismissDecision: (id: string) => post<OpsAction>(`/ops/decisions/${seg(id)}/dismiss`),
  crewList: () => get<CrewFlight[]>("/crew/list"),
  groundQueue: () => get<GroundJob[]>("/ground/queue"),
  groundJobDone: (id: string) => post<GroundJob>(`/ground/jobs/${seg(id)}/done`),
  authorityRequests: () => get<AuthorityRequest[]>("/authority/requests"),

  // Control panel
  adminHealth: () => get<AdminHealth>("/admin/health"),
  adminFlights: () => get<Flight[]>("/admin/flights"),
  injectEvent: (body: InjectEventBody) => post<Flight>("/admin/events", body),
  setBreaker: (name: string, state: "open" | "closed" | "auto") => post<Breaker>(`/admin/breaker/${seg(name)}`, { state }),
  dlq: () => get<Dlq>("/admin/dlq"),
  replayDlq: (body: DlqReplayBody) => post<{ replayed: number }>("/admin/dlq/replay", body),
  audit: (limit = 100) => get<AuditEntry[]>(`/admin/audit?limit=${limit}`),

  // Demo and trace
  demo: () => get<{ demo: DemoState | null }>("/admin/demo"),
  demoRun: () => post<{ demo: DemoState }>("/admin/demo/run"),
  demoReset: () => post<{ erased: number }>("/admin/demo/reset"),
  demoBoard: () => get<DemoBoard>("/admin/demo/board"),
  trace: (limit = 300) => get<TraceEntry[]>(`/admin/trace?limit=${limit}`),
};

export const streams = {
  me: "/me/stream",
  staff: (audience: Audience) => `/staff/stream?audience=${audience}`,
  trace: "/admin/trace/stream",
};

/* ───────────── Hooks ───────────── */

export type Resource<T> = {
  data: T | undefined;
  error: unknown;
  /** True until the first answer (data or error) arrives. */
  loading: boolean;
  /** True while a background refetch runs. */
  refreshing: boolean;
  reload: () => Promise<void>;
  setData: (next: T | ((current: T | undefined) => T | undefined)) => void;
};

/**
 * Loads a resource once and exposes `reload`. A failed background reload keeps the last data and reports the error.
 * `pollMs` refetches on an interval while the tab is visible; a new `key` refetches at once.
 */
export function useResource<T>(fetcher: () => Promise<T>, options: { pollMs?: number; enabled?: boolean; key?: string } = {}): Resource<T> {
  const { pollMs, enabled = true, key } = options;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetcherRef = useRef(fetcher);
  const alive = useRef(true);
  const ticket = useRef(0);
  useEffect(() => { fetcherRef.current = fetcher; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    setRefreshing(true);
    try {
      const next = await fetcherRef.current();
      if (!alive.current || mine !== ticket.current) return;
      setData(next);
      setError(null);
    } catch (caught) {
      if (!alive.current || mine !== ticket.current) return;
      setError(caught);
    } finally {
      if (alive.current && mine === ticket.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    if (!pollMs) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs, reload, key]);

  return { data, error, loading, refreshing, reload, setData };
}

export type StreamState = "connecting" | "open" | "retrying";

/**
 * Server-sent events with cookies. EventSource retries dropped connections on its own, but gives up when the
 * server answers with an error status; this hook then opens a new one with a growing delay (1 s up to 30 s).
 * `handlers` maps an event name to a callback that receives the parsed JSON data.
 */
export function useEventStream(path: string | null, handlers: Record<string, (data: unknown) => void>): StreamState {
  const [state, setState] = useState<StreamState>("connecting");
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });
  const names = Object.keys(handlers).sort().join(",");

  useEffect(() => {
    if (!path || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let timer: number | undefined;
    let attempt = 0;
    let closed = false;

    const open = () => {
      if (closed) return;
      setState(attempt === 0 ? "connecting" : "retrying");
      const current = new EventSource(`${API_URL}${path}`, { withCredentials: true });
      source = current;
      current.onopen = () => { attempt = 0; setState("open"); };
      for (const name of names.split(",").filter(Boolean)) {
        current.addEventListener(name, (event) => {
          let data: unknown = {};
          try { data = JSON.parse((event as MessageEvent<string>).data || "{}"); } catch { /* keep {} */ }
          handlersRef.current[name]?.(data);
        });
      }
      current.onerror = () => {
        if (closed) return;
        setState("retrying");
        // CONNECTING means the browser is already retrying; CLOSED means it gave up.
        if (current.readyState !== EventSource.CLOSED) return;
        current.close();
        attempt += 1;
        timer = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5)));
      };
    };

    open();
    return () => {
      closed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      source?.close();
    };
  }, [path, names]);

  return state;
}
