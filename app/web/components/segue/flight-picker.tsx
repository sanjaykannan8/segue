"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { api, errorMessage, isStatus, type Airport, type Departure, type DepartureList, type Flight, type FlightInput, type ManualFlight } from "@/lib/api";
import { isFlightIata, normalizeFlightIata } from "@/lib/bcbp";
import { flightLabel, formatDateTime, humanize, localInputToIso } from "@/lib/format";
import { ErrorState, Fact, Mascot } from "./ui";
import styles from "./flight-picker.module.css";

/* ───────────── A chosen flight ───────────── */

export type ManualForm = { number: string; origin: string; dest: string; sched_dep: string; sched_arr: string; dep_terminal: string; arr_terminal: string };
export type FlightChoice =
  | { kind: "lookup"; flight: Flight }
  /** from is absent when the flight was picked from an arrivals list (only the landing airport is known to the list). */
  | { kind: "departure"; departure: Departure; from?: string; to: string }
  | { kind: "manual"; form: ManualForm };

export function choiceSummary(choice: FlightChoice) {
  if (choice.kind === "lookup") {
    const f = choice.flight;
    return { iata: f.flight_iata, origin: f.origin, dest: f.dest, dep: f.est_dep ?? f.sched_dep, arr: f.est_arr ?? f.sched_arr, operatedBy: null as string | null };
  }
  if (choice.kind === "departure") {
    const d = choice.departure;
    return { iata: d.flight_iata, origin: d.origin, dest: d.dest, dep: d.est_dep ?? d.sched_dep, arr: d.est_arr ?? d.sched_arr, operatedBy: d.operated_by };
  }
  const m = choice.form;
  return { iata: normalizeFlightIata(m.number), origin: m.origin.trim().toUpperCase(), dest: m.dest.trim().toUpperCase(), dep: localInputToIso(m.sched_dep), arr: localInputToIso(m.sched_arr), operatedBy: null as string | null };
}

export function choiceToInput(choice: FlightChoice): FlightInput {
  if (choice.kind === "lookup") return { flight_iata: choice.flight.flight_iata };
  // Picked from a departures list: the server already holds this row, so it spends no extra query.
  if (choice.kind === "departure") return { flight_iata: choice.departure.flight_iata, ...(choice.from ? { dep_airport: choice.from } : {}), arr_airport: choice.to };
  const m = choice.form;
  const manual: ManualFlight = {
    origin: m.origin.trim().toUpperCase(),
    dest: m.dest.trim().toUpperCase(),
    sched_dep: localInputToIso(m.sched_dep) ?? "",
    sched_arr: localInputToIso(m.sched_arr) ?? "",
    ...(m.dep_terminal.trim() ? { dep_terminal: m.dep_terminal.trim() } : {}),
    ...(m.arr_terminal.trim() ? { arr_terminal: m.arr_terminal.trim() } : {}),
  };
  return { flight_iata: normalizeFlightIata(m.number), manual };
}

/* ───────────── Caches: one request per airport search and per route list, for as long as the page is open ───────────── */

const airportCache = new Map<string, Airport[]>();
const departureCache = new Map<string, DepartureList>();

/* ───────────── Flights on a route ───────────── */

function RouteFlights({ from, to, after, heading, onPick, onUnavailable, onUseNumber, onUseManual }: {
  from: string; to: string; after?: string | null; heading: string;
  onPick: (departure: Departure) => void;
  onUnavailable: (message: string) => void;
  onUseNumber: () => void;
  onUseManual: () => void;
}) {
  const cacheKey = `${from}|${to}|${after ?? ""}`;
  const [state, setState] = useState<{ key: string; list?: DepartureList; error?: unknown }>({ key: cacheKey, list: departureCache.get(cacheKey) });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const current = state.key === cacheKey ? state : { key: cacheKey, list: departureCache.get(cacheKey) };

  useEffect(() => {
    if (departureCache.has(cacheKey)) return;
    let alive = true;
    api.departures(from, to, after)
      .then((list) => { departureCache.set(cacheKey, list); if (alive) setState({ key: cacheKey, list }); })
      .catch((error) => {
        if (!alive) return;
        setState({ key: cacheKey, error });
        // No flight data for this route: fall back to typing the details.
        if (isStatus(error, 404, 503)) onUnavailable(errorMessage(error));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only for a new route/time or an explicit retry
  }, [cacheKey, attempt]);

  const list = current.list;
  const rows = list?.flights;
  const hours = list?.window_hours ?? 10;
  const shown = useMemo(() => {
    const needle = filter.trim().toUpperCase().replace(/\s+/g, "");
    if (!rows || !needle) return rows ?? [];
    return rows.filter((row) => row.flight_iata.toUpperCase().includes(needle) || row.dest.toUpperCase().includes(needle) || (row.operated_by ?? "").toUpperCase().includes(needle));
  }, [rows, filter]);

  if (current.error) return <ErrorState compact error={current.error} title="Flights didn't load" onRetry={() => { setState({ key: cacheKey }); setAttempt((n) => n + 1); }} />;
  if (!rows) return <Skeleton label={`Loading flights from ${from} to ${to}`} lines={4} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Mascot pose="sleepy" size={40} />}
        title={`No flights found leaving ${from} for ${to} in the next ${hours} hours`}
        description="A later flight will not be listed yet. You can still add it."
        label="No flights on this route"
        action={<>
          <Button type="button" variant="secondary" size="sm" onClick={onUseNumber}>Enter the flight number</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onUseManual}>Enter details by hand</Button>
        </>}
      />
    );
  }

  return (
    <div className={styles.listBlock}>
      <p className={styles.listHeading}>{heading}</p>
      {rows.length > 5 ? (
        <Input label="Filter by flight number" placeholder="BA 108" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={filter} onChange={(event) => setFilter(event.target.value)} />
      ) : null}
      {shown.length === 0 ? <p className={styles.quiet}>Nothing matches “{filter.trim()}”.</p> : (
        <ul className={styles.list} aria-label={heading}>
          {shown.map((row) => {
            const place = [row.dep_terminal ? `Terminal ${row.dep_terminal.replace(/^T/i, "")}` : null, row.dep_gate ? `Gate ${row.dep_gate}` : null].filter(Boolean).join(" · ");
            return (
              <li key={`${row.flight_iata}|${row.date}|${row.sched_dep ?? ""}`}>
                <button type="button" className={styles.row} onClick={() => onPick(row)}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowFlight}>{flightLabel(row.flight_iata)}</span>
                    <span className={styles.rowRoute}>{row.origin} <ArrowRight width={14} height={14} aria-label="to" /> {row.dest}</span>
                  </span>
                  <span className={styles.rowSide}>
                    <span className={styles.rowTime}>{formatDateTime(row.est_dep ?? row.sched_dep)}</span>
                    <span className={styles.rowMeta}>{[humanize(row.status), place].filter(Boolean).join(" · ")}</span>
                  </span>
                  {row.operated_by ? <span className={styles.rowNote}>Operated by {flightLabel(row.operated_by)}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.quiet}>
        Showing flights in the next {hours} hours. Times are in your device&apos;s time zone.
        {list?.truncated ? " This list may be incomplete. Try the flight number." : ""}
      </p>
    </div>
  );
}

/* ───────────── One airport: type a city, pick an airport ───────────── */

function AirportField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: Airport | null; onChange: (airport: Airport | null) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; airports?: Airport[]; error?: unknown } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const q = query.trim().toLowerCase();

  // Debounced, 3+ characters, cached per query: typing never fires a request per keystroke, and focus never searches.
  useEffect(() => {
    if (value || q.length < 3) return;
    const cached = airportCache.get(q);
    if (cached) { setResult({ q, airports: cached }); return; }
    let alive = true;
    const timer = window.setTimeout(() => {
      api.searchAirports(q)
        .then((airports) => { airportCache.set(q, airports); if (alive) setResult({ q, airports }); })
        .catch((error) => { if (alive) setResult({ q, error }); });
    }, 400);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [q, value, attempt]);

  if (value) {
    return (
      <div className={styles.picked}>
        <MapPin width={18} height={18} aria-hidden="true" />
        <span className={styles.pickedText}><span className={styles.pickedLabel}>{label}</span><strong>{value.name}</strong> ({value.iata})</span>
        <button type="button" className={styles.linkButton} onClick={() => { setQuery(""); setResult(null); onChange(null); }} aria-label={`Change ${label.toLowerCase()} airport`}>Change</button>
      </div>
    );
  }

  const current = result && result.q === q ? result : null;
  return (
    <div className={styles.stack}>
      <Input label={label} placeholder={placeholder} autoComplete="off" spellCheck={false} enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} description="Type at least 3 letters of the city or airport." />
      {q.length >= 3 && !current ? <Skeleton label="Searching airports" lines={2} /> : null}
      {current?.error ? <ErrorState compact error={current.error} title="Airport search didn't work" onRetry={() => { setResult(null); setAttempt((n) => n + 1); }} /> : null}
      {current?.airports && current.airports.length === 0 ? <p className={styles.quiet}>No airport matches “{query.trim()}”. Check the spelling or try the airport code.</p> : null}
      {current?.airports && current.airports.length > 0 ? (
        <ul className={styles.list} aria-label={`${label}: airports`}>
          {current.airports.map((entry) => (
            <li key={entry.iata}>
              <button type="button" className={styles.row} onClick={() => onChange(entry)}>
                <span className={styles.rowMain}>
                  <span className={styles.rowFlight}>{entry.name}</span>
                  <span className={styles.rowMeta}>{entry.country ?? "Country not listed"}</span>
                </span>
                <span className={styles.code}>{entry.iata}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ───────────── Search by route ───────────── */

function RouteSearch({ fixedFrom, after, onPick, onUnavailable, onUseNumber, onUseManual }: {
  /** Connecting flight: the departure airport is the first flight's destination. */
  fixedFrom?: string;
  after?: string | null;
  onPick: (departure: Departure, from: string, to: string) => void;
  onUnavailable: (message: string) => void;
  onUseNumber: () => void;
  onUseManual: () => void;
}) {
  const [from, setFrom] = useState<Airport | null>(null);
  const [to, setTo] = useState<Airport | null>(null);
  const fromCode = fixedFrom ?? from?.iata;

  return (
    <div className={styles.stack}>
      {fixedFrom ? (
        <div className={styles.picked}>
          <MapPin width={18} height={18} aria-hidden="true" />
          <span className={styles.pickedText}><span className={styles.pickedLabel}>From</span><strong>{fixedFrom}</strong>, where your first flight lands</span>
        </div>
      ) : (
        <AirportField label="From" placeholder="Delhi" value={from} onChange={setFrom} />
      )}
      {fromCode ? <AirportField label="To" placeholder={fixedFrom ? "London" : "Dubai"} value={to} onChange={setTo} /> : null}
      {fromCode && to ? (
        fromCode === to.iata
          ? <p className={styles.problem} role="alert">Pick a different airport to fly to.</p>
          : (
            <RouteFlights
              from={fromCode}
              to={to.iata}
              after={after}
              heading={fixedFrom ? `Flights from ${fromCode} to ${to.iata} after you land` : `Flights from ${fromCode} to ${to.iata}`}
              onPick={(departure) => onPick(departure, fromCode, to.iata)}
              onUnavailable={onUnavailable}
              onUseNumber={onUseNumber}
              onUseManual={onUseManual}
            />
          )
      ) : null}
    </div>
  );
}

/* ───────────── Flights flying to an airport ───────────── */

const arrivalCache = new Map<string, DepartureList>();

function ArrivalFlights({ airport, onPick, onUnavailable, onUseNumber, onUseRoute }: {
  airport: string;
  onPick: (flight: Departure) => void;
  onUnavailable: (message: string) => void;
  onUseNumber: () => void;
  onUseRoute: () => void;
}) {
  const [state, setState] = useState<{ key: string; list?: DepartureList; error?: unknown }>({ key: airport, list: arrivalCache.get(airport) });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const current = state.key === airport ? state : { key: airport, list: arrivalCache.get(airport) };
  const heading = `Flights flying to ${airport}`;

  useEffect(() => {
    if (arrivalCache.has(airport)) return;
    let alive = true;
    api.arrivals(airport)
      .then((list) => { arrivalCache.set(airport, list); if (alive) setState({ key: airport, list }); })
      .catch((error) => {
        if (!alive) return;
        setState({ key: airport, error });
        if (isStatus(error, 404, 503)) onUnavailable(errorMessage(error));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only for a new airport or an explicit retry
  }, [airport, attempt]);

  const list = current.list;
  const rows = list?.flights;
  const shown = useMemo(() => {
    const needle = filter.trim().toUpperCase().replace(/\s+/g, "");
    if (!rows || !needle) return rows ?? [];
    return rows.filter((row) => row.flight_iata.toUpperCase().includes(needle) || row.origin.toUpperCase().includes(needle) || (row.operated_by ?? "").toUpperCase().includes(needle));
  }, [rows, filter]);

  if (current.error) return <ErrorState compact error={current.error} title="Flights didn't load" onRetry={() => { setState({ key: airport }); setAttempt((n) => n + 1); }} />;
  if (!rows) return <Skeleton label={`Loading flights flying to ${airport}`} lines={4} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Mascot pose="sleepy" size={40} />}
        title={`No flights found landing at ${airport} in the next few hours`}
        description="A later flight will not be listed yet. You can still add it."
        label="No arriving flights"
        action={<>
          <Button type="button" variant="secondary" size="sm" onClick={onUseNumber}>Enter the flight number</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onUseRoute}>Search by route</Button>
        </>}
      />
    );
  }

  return (
    <div className={styles.listBlock}>
      <p className={styles.listHeading}>{heading}</p>
      <Input label="Filter by flight number or origin" placeholder="EK 512 or DEL" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={filter} onChange={(event) => setFilter(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
      {shown.length === 0 ? <p className={styles.quiet}>Nothing matches “{filter.trim()}”.</p> : (
        <ul className={styles.list} aria-label={heading}>
          {shown.map((row) => (
            <li key={`${row.flight_iata}|${row.date}|${row.sched_dep ?? ""}|${row.origin}`}>
              <button type="button" className={styles.row} onClick={() => onPick(row)}>
                <span className={styles.rowMain}>
                  <span className={styles.rowFlight}>{flightLabel(row.flight_iata)}</span>
                  <span className={styles.rowRoute}>{row.origin} <ArrowRight width={14} height={14} aria-label="to" /> {row.dest}</span>
                </span>
                <span className={styles.rowSide}>
                  <span className={styles.rowTime}>Lands {formatDateTime(row.est_arr ?? row.sched_arr)}</span>
                  <span className={styles.rowMeta}>{[row.status === "active" ? "In the air" : "Scheduled", row.arr_terminal ? `Terminal ${row.arr_terminal.replace(/^T/i, "")}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                {row.operated_by ? <span className={styles.rowNote}>Operated by {flightLabel(row.operated_by)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.quiet}>
        Flights landing in the next few hours. Times are in your device&apos;s time zone.
        {list?.truncated ? " This list may be incomplete. Try the flight number or the route." : ""}
      </p>
    </div>
  );
}

function ArrivalSearch({ onPick, onUnavailable, onUseNumber, onUseRoute }: {
  onPick: (flight: Departure, airport: string) => void;
  onUnavailable: (message: string) => void;
  onUseNumber: () => void;
  onUseRoute: () => void;
}) {
  const [airport, setAirport] = useState<Airport | null>(null);
  return (
    <div className={styles.stack}>
      <AirportField label="Where does your first flight land?" placeholder="Dubai" value={airport} onChange={setAirport} />
      {airport ? <ArrivalFlights airport={airport.iata} onPick={(flight) => onPick(flight, airport.iata)} onUnavailable={onUnavailable} onUseNumber={onUseNumber} onUseRoute={onUseRoute} /> : null}
    </div>
  );
}

/* ───────────── By flight number ───────────── */

function NumberLookup({ initial, onFound, onUnavailable }: { initial: string; onFound: (flight: Flight) => void; onUnavailable: (message: string, number: string) => void }) {
  const [number, setNumber] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function find() {
    if (!isFlightIata(number)) { setError("Enter a flight number like EK 512."); return; }
    setBusy(true);
    setError(undefined);
    try {
      onFound((await api.lookupFlight(normalizeFlightIata(number))).flight);
    } catch (caught) {
      if (isStatus(caught, 404, 503)) onUnavailable(errorMessage(caught), number);
      else setError(errorMessage(caught));
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.stack}>
      <Input
        label="Flight number"
        placeholder="EK 512"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={number}
        onChange={(event) => { setNumber(event.target.value); setError(undefined); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void find(); } }}
        error={error}
      />
      <Button type="button" variant="secondary" loading={busy} onClick={() => void find()}>
        <Search width={16} height={16} aria-hidden="true" /> Find flight
      </Button>
    </div>
  );
}

/* ───────────── By hand (last resort) ───────────── */

function manualProblem(form: ManualForm): string | null {
  if (!isFlightIata(form.number)) return "Enter the flight number, like EK 512.";
  if (!/^[A-Za-z]{3}$/.test(form.origin.trim()) || !/^[A-Za-z]{3}$/.test(form.dest.trim())) return "Use the three-letter airport codes, like DXB.";
  const dep = localInputToIso(form.sched_dep), arr = localInputToIso(form.sched_arr);
  if (!dep || !arr) return "Add the scheduled departure and arrival times.";
  if (arr <= dep) return "Arrival must be after departure.";
  return null;
}

function ManualEntry({ initialNumber, initialOrigin, onDone }: { initialNumber: string; initialOrigin: string; onDone: (form: ManualForm) => void }) {
  const [form, setForm] = useState<ManualForm>({ number: initialNumber, origin: initialOrigin, dest: "", sched_dep: "", sched_arr: "", dep_terminal: "", arr_terminal: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof ManualForm) => (event: { target: { value: string } }) => { setForm((now) => ({ ...now, [key]: event.target.value })); setProblem(null); };

  return (
    <div className={styles.stack}>
      <Input label="Flight number" placeholder="EK 512" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={form.number} onChange={set("number")} />
      <div className={styles.row2}>
        <Input label="From (airport code)" placeholder="DEL" maxLength={3} autoCapitalize="characters" autoComplete="off" value={form.origin} onChange={set("origin")} />
        <Input label="To (airport code)" placeholder="DXB" maxLength={3} autoCapitalize="characters" autoComplete="off" value={form.dest} onChange={set("dest")} />
      </div>
      <Input label="Scheduled departure" type="datetime-local" value={form.sched_dep} onChange={set("sched_dep")} description="In your device's time zone." />
      <Input label="Scheduled arrival" type="datetime-local" value={form.sched_arr} onChange={set("sched_arr")} />
      <div className={styles.row2}>
        <Input label="Departure terminal (optional)" autoComplete="off" value={form.dep_terminal} onChange={set("dep_terminal")} />
        <Input label="Arrival terminal (optional)" autoComplete="off" value={form.arr_terminal} onChange={set("arr_terminal")} />
      </div>
      {problem ? <p className={styles.problem} role="alert">{problem}</p> : null}
      <Button type="button" variant="secondary" onClick={() => { const found = manualProblem(form); if (found) setProblem(found); else onDone(form); }}>Use these details</Button>
    </div>
  );
}

/* ───────────── The picker ───────────── */

type Mode = "arrivals" | "list" | "number" | "manual";

export function FlightPicker({ step, title, value, onChange, from, prefillNumber }: {
  step: number;
  title: string;
  value: FlightChoice | null;
  onChange: (choice: FlightChoice | null) => void;
  /** Connecting flight: the departure airport is fixed to the first flight's destination, and flights are listed after it lands. */
  from?: { airport: string; after: string | null };
  /** A flight number read from the boarding pass. */
  prefillNumber?: string;
}) {
  const [mode, setMode] = useState<Mode>(prefillNumber ? "number" : from ? "list" : "arrivals");
  const [notice, setNotice] = useState<string | null>(null);
  const [number, setNumber] = useState(prefillNumber ?? "");

  const toManual = (message: string, typed?: string) => { if (typed !== undefined) setNumber(typed); setNotice(message); setMode("manual"); };

  if (value) {
    const summary = choiceSummary(value);
    return (
      <section className={styles.step} aria-label={title}>
        <StepHead step={step} title={title} done />
        <div className={styles.confirm}>
          <div className={styles.confirmTop}>
            <span className={styles.confirmFlight}>{flightLabel(summary.iata)}</span>
            <Badge size="sm" tone={value.kind === "manual" ? "neutral" : "info"} icon={<Check width={12} height={12} aria-hidden="true" />}>{value.kind === "manual" ? "Entered by hand" : "Flight found"}</Badge>
          </div>
          <p className={styles.route}><span>{summary.origin}</span><ArrowRight width={18} height={18} aria-label="to" /><span>{summary.dest}</span></p>
          {summary.operatedBy ? <p className={styles.quiet}>Operated by {flightLabel(summary.operatedBy)}</p> : null}
          <dl className={styles.times}>
            <Fact label="Departs">{formatDateTime(summary.dep)}</Fact>
            <Fact label="Arrives">{formatDateTime(summary.arr)}</Fact>
          </dl>
          <button type="button" className={styles.linkButton} onClick={() => onChange(null)}>Change this flight</button>
        </div>
      </section>
    );
  }

  const home: Mode = from ? "list" : "arrivals";
  const options = from
    ? [{ value: "list", label: "By route" }, { value: "number", label: "By flight number" }]
    : [{ value: "arrivals", label: "Flying to" }, { value: "list", label: "By route" }, { value: "number", label: "Flight no." }];

  return (
    <section className={styles.step} aria-label={title}>
      <StepHead step={step} title={title} />
      {mode !== "manual" ? (
        <SegmentedControl options={options} value={mode} onValueChange={(next) => { setNotice(null); setMode(next === "number" ? "number" : next === "arrivals" && !from ? "arrivals" : "list"); }} label={`How to find ${title.toLowerCase()}`} />
      ) : null}

      {mode === "arrivals" ? (
        <ArrivalSearch
          onPick={(departure, airport) => onChange({ kind: "departure", departure, to: airport })}
          onUnavailable={(message) => toManual(message)}
          onUseNumber={() => { setNotice(null); setMode("number"); }}
          onUseRoute={() => { setNotice(null); setMode("list"); }}
        />
      ) : null}
      {mode === "list" ? (
        <RouteSearch
          fixedFrom={from?.airport}
          after={from?.after}
          onPick={(departure, routeFrom, routeTo) => onChange({ kind: "departure", departure, from: routeFrom, to: routeTo })}
          onUnavailable={(message) => toManual(message)}
          onUseNumber={() => { setNotice(null); setMode("number"); }}
          onUseManual={() => { setNotice(null); setMode("manual"); }}
        />
      ) : null}
      {mode === "number" ? (
        <NumberLookup initial={number} onFound={(flight) => onChange({ kind: "lookup", flight })} onUnavailable={toManual} />
      ) : null}
      {mode === "manual" ? (
        <div className={styles.stack}>
          <p className={styles.notice} role="status">{notice ? `${notice} ` : ""}Add the details from your ticket.</p>
          <ManualEntry initialNumber={number} initialOrigin={from?.airport ?? ""} onDone={(form) => onChange({ kind: "manual", form })} />
          <button type="button" className={styles.linkButton} onClick={() => { setNotice(null); setMode(home); }}>Back to search</button>
        </div>
      ) : (
        <button type="button" className={styles.linkButton} onClick={() => { setNotice(null); setMode("manual"); }}>Enter details by hand</button>
      )}
    </section>
  );
}

function StepHead({ step, title, done = false }: { step: number; title: string; done?: boolean }) {
  return (
    <div className={styles.stepHead}>
      <span className={styles.stepNumber} data-done={done || undefined} aria-hidden="true">{done ? <Check width={14} height={14} /> : step}</span>
      <h2 className={styles.stepTitle}>{title}</h2>
    </div>
  );
}
