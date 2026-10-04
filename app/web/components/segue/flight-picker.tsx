"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check, MapPin, Search } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { api, isStatus, type Airport, type Departure, type DepartureList, type Flight, type FlightInput, type ManualFlight } from "@/lib/api";
import { isFlightIata, normalizeFlightIata } from "@/lib/bcbp";
import { flightLabel, localInputToIso } from "@/lib/format";
import { useFormat, useT, type Key } from "@/lib/i18n";
import { ErrorState, Fact, Ltr, Mascot } from "./ui";
import styles from "./flight-picker.module.css";

/** Segue runs at Dubai International only: the first flight lands there and the second leaves from it. */
const HUB = "DXB";

/* ───────────── A chosen flight ───────────── */

type ManualForm = { number: string; origin: string; dest: string; sched_dep: string; sched_arr: string; dep_terminal: string; arr_terminal: string };
export type FlightChoice =
  | { kind: "lookup"; flight: Flight }
  /** from is absent when the flight was picked from the arrivals list (that list is keyed by the landing airport only). */
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
  // Picked from a list: the server already holds this row, so it spends no extra query.
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

/* ───────────── Lists: one request per airport search and per list, for as long as the page is open ───────────── */

const airportCache = new Map<string, Airport[]>();
const listCache = new Map<string, DepartureList>();

/** Loads a list once per key, with an explicit retry. It never refetches on its own. */
function useFlightList(cacheKey: string, load: () => Promise<DepartureList>, onUnavailable: (message: string) => void) {
  const format = useFormat();
  const [state, setState] = useState<{ key: string; list?: DepartureList; error?: unknown }>({ key: cacheKey, list: listCache.get(cacheKey) });
  const [attempt, setAttempt] = useState(0);
  const current = state.key === cacheKey ? state : { key: cacheKey, list: listCache.get(cacheKey) };

  useEffect(() => {
    if (listCache.has(cacheKey)) return;
    let alive = true;
    load()
      .then((list) => { listCache.set(cacheKey, list); if (alive) setState({ key: cacheKey, list }); })
      .catch((error) => {
        if (!alive) return;
        setState({ key: cacheKey, error });
        // No flight data: fall back to typing the details, with the API's own message.
        if (isStatus(error, 404, 503)) onUnavailable(format.error(error));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only for a new list or an explicit retry
  }, [cacheKey, attempt]);

  return { list: current.list, error: current.error, retry: () => { setState({ key: cacheKey }); setAttempt((n) => n + 1); } };
}

/** The shared pick-list: a filter, rows at least 56px tall, its own scroll, and one quiet line underneath. */
function FlightList({ rows, heading, filterLabel, filterPlaceholder, filterFields, side, foot, onPick }: {
  rows: Departure[];
  heading: string;
  filterLabel: string;
  filterPlaceholder: string;
  filterFields: (row: Departure) => (string | null)[];
  side: (row: Departure) => { time: string; meta: string };
  foot: ReactNode;
  onPick: (row: Departure) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toUpperCase().replace(/\s+/g, "");
  const shown = needle ? rows.filter((row) => filterFields(row).some((field) => (field ?? "").toUpperCase().includes(needle))) : rows;

  return (
    <div className={styles.listBlock}>
      <p className={styles.listHeading}>{heading}</p>
      {rows.length > 5 ? (
        <Input label={filterLabel} placeholder={filterPlaceholder} dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={filter} onChange={(event) => setFilter(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
      ) : null}
      {shown.length === 0 ? <p className={styles.quiet} role="status">{t("picker.noMatch", { q: filter.trim() })}</p> : (
        <ul className={styles.list} aria-label={heading}>
          {shown.map((row) => {
            const info = side(row);
            return (
              <li key={`${row.flight_iata}|${row.date}|${row.sched_dep ?? ""}|${row.origin}`}>
                <button type="button" className={styles.row} onClick={() => onPick(row)}>
                  <span className={styles.rowMain}>
                    <Ltr className={styles.rowFlight}>{flightLabel(row.flight_iata)}</Ltr>
                    <Ltr className={styles.rowRoute}>{row.origin} <ArrowRight width={14} height={14} aria-hidden="true" /> {row.dest}</Ltr>
                  </span>
                  <span className={styles.rowSide}>
                    <span className={styles.rowTime}>{info.time}</span>
                    <span className={styles.rowMeta}>{info.meta}</span>
                  </span>
                  {row.operated_by ? <span className={styles.rowNote}>{t("picker.operatedBy", { flight: flightLabel(row.operated_by) })}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.quiet}>{t("picker.count", { shown: shown.length, total: rows.length })}. {foot}</p>
    </div>
  );
}

type Fallbacks = { onUnavailable: (message: string) => void; onUseNumber: () => void; onUseOther: () => void };

/** Flights landing at Dubai International, soonest first. */
function ArrivalFlights({ onPick, onUnavailable, onUseNumber, onUseOther }: { onPick: (flight: Departure) => void } & Fallbacks) {
  const t = useT();
  const format = useFormat();
  const { list, error, retry } = useFlightList(`arr|${HUB}`, () => api.arrivals(HUB), onUnavailable);

  if (error) return <ErrorState compact error={error} title={t("picker.flightsError")} onRetry={retry} />;
  if (!list) return <Skeleton label={t("picker.loadingFlights")} lines={4} />;
  if (list.flights.length === 0) {
    return (
      <EmptyState
        icon={<Mascot pose="sleepy" size={40} />}
        title={t("picker.arrivalsEmpty")}
        description={t("picker.laterNote")}
        action={<>
          <Button type="button" variant="secondary" onClick={onUseNumber}>{t("picker.enterNumber")}</Button>
          <Button type="button" variant="ghost" onClick={onUseOther}>{t("picker.searchRoute")}</Button>
        </>}
      />
    );
  }
  return (
    <FlightList
      rows={list.flights}
      heading={t("picker.arrivalsHeading")}
      filterLabel={t("picker.filterArrivals")}
      filterPlaceholder="EK 512 / DEL"
      filterFields={(row) => [row.flight_iata, row.origin, row.operated_by]}
      side={(row) => ({
        time: t("picker.lands", { time: format.dateTime(row.est_arr ?? row.sched_arr) }),
        meta: [t(row.status === "active" ? "picker.inAir" : "picker.scheduled"), row.arr_terminal ? t("picker.terminal", { t: row.arr_terminal.replace(/^T/i, "") }) : null].filter(Boolean).join(" · "),
      })}
      foot={<>{t("picker.arrivalsFoot")}{list.truncated ? ` ${t("picker.truncatedArrivals")}` : ""}</>}
      onPick={onPick}
    />
  );
}

/** Flights on one route. */
function RouteFlights({ from, to, after, onPick, onUnavailable, onUseNumber, onUseOther }: { from: string; to: string; after?: string | null; onPick: (flight: Departure) => void } & Fallbacks) {
  const t = useT();
  const format = useFormat();
  const { list, error, retry } = useFlightList(`dep|${from}|${to}|${after ?? ""}`, () => api.departures(from, to, after), onUnavailable);
  const hours = list?.window_hours ?? 10;

  if (error) return <ErrorState compact error={error} title={t("picker.flightsError")} onRetry={retry} />;
  if (!list) return <Skeleton label={t("picker.loadingFlights")} lines={4} />;
  if (list.flights.length === 0) {
    return (
      <EmptyState
        icon={<Mascot pose="sleepy" size={40} />}
        title={t("picker.routeEmpty", { from, to, n: hours })}
        description={t("picker.laterNote")}
        action={<>
          <Button type="button" variant="secondary" onClick={onUseNumber}>{t("picker.enterNumber")}</Button>
          <Button type="button" variant="ghost" onClick={onUseOther}>{t("picker.enterByHand")}</Button>
        </>}
      />
    );
  }
  return (
    <FlightList
      rows={list.flights}
      heading={t(after ? "picker.routeHeadingAfter" : "picker.routeHeading", { from, to })}
      filterLabel={t("picker.filterRoute")}
      filterPlaceholder="BA 108"
      filterFields={(row) => [row.flight_iata, row.operated_by]}
      side={(row) => ({
        time: format.dateTime(row.est_dep ?? row.sched_dep),
        meta: [t(row.status === "active" ? "picker.inAir" : "picker.scheduled"), row.dep_terminal ? t("picker.terminal", { t: row.dep_terminal.replace(/^T/i, "") }) : null, row.dep_gate ? t("picker.gate", { g: row.dep_gate }) : null].filter(Boolean).join(" · "),
      })}
      foot={<>{t("picker.routeFoot", { n: hours })}{list.truncated ? ` ${t("picker.truncatedRoute")}` : ""}</>}
      onPick={onPick}
    />
  );
}

/* ───────────── One airport: type a city, pick an airport ───────────── */

function FixedAirport({ label, note }: { label: string; note: string }) {
  const t = useT();
  return (
    <div className={styles.picked}>
      <MapPin width={18} height={18} aria-hidden="true" />
      <span className={styles.pickedText}><span className={styles.pickedLabel}>{label}</span><strong>{t("picker.dxb")}</strong><span className={styles.pickedNote}>{note}</span></span>
    </div>
  );
}

function AirportField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: Airport | null; onChange: (airport: Airport | null) => void }) {
  const t = useT();
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
        <span className={styles.pickedText}><span className={styles.pickedLabel}>{label}</span><strong>{value.name}</strong> <Ltr>({value.iata})</Ltr></span>
        <button type="button" className={styles.linkButton} onClick={() => { setQuery(""); setResult(null); onChange(null); }} aria-label={t("picker.changeAirport", { label })}>{t("common.change")}</button>
      </div>
    );
  }

  const current = result && result.q === q ? result : null;
  return (
    <div className={styles.stack}>
      <Input label={label} placeholder={placeholder} autoComplete="off" spellCheck={false} enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} description={t("picker.airportHint")} />
      {q.length >= 3 && !current ? <Skeleton label={t("picker.searching")} lines={2} /> : null}
      {current?.error ? <ErrorState compact error={current.error} title={t("picker.searchError")} onRetry={() => { setResult(null); setAttempt((n) => n + 1); }} /> : null}
      {current?.airports && current.airports.length === 0 ? <p className={styles.quiet} role="status">{t("picker.noAirport", { q: query.trim() })}</p> : null}
      {current?.airports && current.airports.length > 0 ? (
        <ul className={styles.list} aria-label={`${label}: ${t("picker.airports")}`}>
          {current.airports.map((entry) => (
            <li key={entry.iata}>
              <button type="button" className={styles.row} onClick={() => onChange(entry)}>
                <span className={styles.rowMain}>
                  <span className={styles.rowFlight}>{entry.name}</span>
                  <span className={styles.rowMeta}>{entry.country ?? t("picker.countryUnknown")}</span>
                </span>
                <Ltr className={styles.code}>{entry.iata}</Ltr>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ───────────── By route: one end is always Dubai International ───────────── */

function RouteSearch({ leg, after, onPick, onUnavailable, onUseNumber, onUseOther }: { leg: Leg; after?: string | null; onPick: (flight: Departure, from: string, to: string) => void } & Fallbacks) {
  const t = useT();
  const [other, setOther] = useState<Airport | null>(null);
  const from = leg === "first" ? other?.iata : HUB;
  const to = leg === "first" ? HUB : other?.iata;

  const fixed = <FixedAirport label={t(leg === "first" ? "picker.to" : "picker.from")} note={t(leg === "first" ? "picker.fixedFirst" : "picker.fixedSecond")} />;
  const search = <AirportField label={t(leg === "first" ? "picker.from" : "picker.to")} placeholder={leg === "first" ? "Delhi" : "London"} value={other} onChange={setOther} />;

  return (
    <div className={styles.stack}>
      {leg === "first" ? <>{search}{fixed}</> : <>{fixed}{search}</>}
      {from && to ? (
        from === to
          ? <p className={styles.problem} role="alert">{t("picker.sameAirport")}</p>
          : <RouteFlights from={from} to={to} after={leg === "second" ? after : null} onPick={(flight) => onPick(flight, from, to)} onUnavailable={onUnavailable} onUseNumber={onUseNumber} onUseOther={onUseOther} />
      ) : null}
    </div>
  );
}

/* ───────────── By flight number ───────────── */

function NumberLookup({ initial, onFound, onUnavailable }: { initial: string; onFound: (flight: Flight) => void; onUnavailable: (message: string, number: string) => void }) {
  const t = useT();
  const format = useFormat();
  const [number, setNumber] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function find() {
    if (!isFlightIata(number)) { setError(t("picker.numberError")); return; }
    setBusy(true);
    setError(undefined);
    try {
      onFound((await api.lookupFlight(normalizeFlightIata(number))).flight);
    } catch (caught) {
      if (isStatus(caught, 404, 503)) onUnavailable(format.error(caught), number);
      else setError(format.error(caught));
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.stack}>
      <Input
        label={t("picker.number")}
        placeholder="EK 512"
        dir="ltr"
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
        <Search width={16} height={16} aria-hidden="true" /> {t("picker.find")}
      </Button>
    </div>
  );
}

/* ───────────── By hand (last resort) ───────────── */

function manualProblem(form: ManualForm): Key | null {
  if (!isFlightIata(form.number)) return "manual.errNumber";
  if (!/^[A-Za-z]{3}$/.test(form.origin.trim()) || !/^[A-Za-z]{3}$/.test(form.dest.trim())) return "manual.errCodes";
  const dep = localInputToIso(form.sched_dep), arr = localInputToIso(form.sched_arr);
  if (!dep || !arr) return "manual.errTimes";
  if (arr <= dep) return "manual.errOrder";
  return null;
}

function ManualEntry({ leg, initialNumber, onDone }: { leg: Leg; initialNumber: string; onDone: (form: ManualForm) => void }) {
  const t = useT();
  // The Dubai end is fixed: the first flight lands there, the second leaves from it.
  const [form, setForm] = useState<ManualForm>({ number: initialNumber, origin: leg === "second" ? HUB : "", dest: leg === "first" ? HUB : "", sched_dep: "", sched_arr: "", dep_terminal: "", arr_terminal: "" });
  const [problem, setProblem] = useState<Key | null>(null);
  const set = (key: keyof ManualForm) => (event: { target: { value: string } }) => { setForm((now) => ({ ...now, [key]: event.target.value })); setProblem(null); };

  return (
    <div className={styles.stack}>
      <Input label={t("picker.number")} placeholder="EK 512" dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={form.number} onChange={set("number")} />
      <div className={styles.row2}>
        <Input label={t("manual.fromCode")} placeholder="DEL" dir="ltr" maxLength={3} autoCapitalize="characters" autoComplete="off" value={form.origin} onChange={set("origin")} readOnly={leg === "second"} aria-readonly={leg === "second" || undefined} description={leg === "second" ? t("manual.fixed") : undefined} />
        <Input label={t("manual.toCode")} placeholder="LHR" dir="ltr" maxLength={3} autoCapitalize="characters" autoComplete="off" value={form.dest} onChange={set("dest")} readOnly={leg === "first"} aria-readonly={leg === "first" || undefined} description={leg === "first" ? t("manual.fixed") : undefined} />
      </div>
      <Input label={t("manual.dep")} type="datetime-local" dir="ltr" value={form.sched_dep} onChange={set("sched_dep")} description={t("manual.depHint")} />
      <Input label={t("manual.arr")} type="datetime-local" dir="ltr" value={form.sched_arr} onChange={set("sched_arr")} />
      <div className={styles.row2}>
        <Input label={t("manual.depTerminal")} dir="ltr" autoComplete="off" value={form.dep_terminal} onChange={set("dep_terminal")} />
        <Input label={t("manual.arrTerminal")} dir="ltr" autoComplete="off" value={form.arr_terminal} onChange={set("arr_terminal")} />
      </div>
      {problem ? <p className={styles.problem} role="alert">{t(problem)}</p> : null}
      <Button type="button" variant="secondary" onClick={() => { const found = manualProblem(form); if (found) setProblem(found); else onDone(form); }}>{t("manual.use")}</Button>
    </div>
  );
}

/* ───────────── The picker ───────────── */

type Leg = "first" | "second";
type Mode = "arrivals" | "route" | "number" | "manual";

export function FlightPicker({ step, title, leg, after, value, onChange, prefillNumber }: {
  step: number;
  title: string;
  leg: Leg;
  /** Second flight: list departures after the first flight lands. */
  after?: string | null;
  value: FlightChoice | null;
  onChange: (choice: FlightChoice | null) => void;
  /** A flight number read from the boarding pass. */
  prefillNumber?: string;
}) {
  const t = useT();
  const format = useFormat();
  const home: Mode = leg === "first" ? "arrivals" : "route";
  const [mode, setMode] = useState<Mode>(prefillNumber ? "number" : home);
  const [notice, setNotice] = useState<string | null>(null);
  const [number, setNumber] = useState(prefillNumber ?? "");

  const go = (next: Mode) => { setNotice(null); setMode(next); };
  const toManual = (message: string, typed?: string) => { if (typed !== undefined) setNumber(typed); setNotice(message); setMode("manual"); };

  if (value) {
    const summary = choiceSummary(value);
    return (
      <section className={styles.step} aria-label={title}>
        <StepHead step={step} title={title} done />
        <div className={styles.confirm}>
          <div className={styles.confirmTop}>
            <Ltr className={styles.confirmFlight}>{flightLabel(summary.iata)}</Ltr>
            <Badge size="sm" tone={value.kind === "manual" ? "neutral" : "info"} icon={<Check width={12} height={12} aria-hidden="true" />}>{t(value.kind === "manual" ? "picker.byHand" : "picker.found")}</Badge>
          </div>
          <p className={styles.route}><Ltr>{summary.origin} <ArrowRight width={18} height={18} aria-hidden="true" /> {summary.dest}</Ltr></p>
          {summary.operatedBy ? <p className={styles.quiet}>{t("picker.operatedBy", { flight: flightLabel(summary.operatedBy) })}</p> : null}
          <dl className={styles.times}>
            <Fact label={t("picker.departs")}>{format.dateTime(summary.dep)}</Fact>
            <Fact label={t("picker.arrives")}>{format.dateTime(summary.arr)}</Fact>
          </dl>
          <button type="button" className={styles.linkButton} onClick={() => onChange(null)}>{t("picker.changeFlight")}</button>
        </div>
      </section>
    );
  }

  const options = [
    ...(leg === "first" ? [{ value: "arrivals", label: t("picker.modeArrivals") }] : []),
    { value: "route", label: t("picker.modeRoute") },
    { value: "number", label: t("picker.modeNumber") },
  ];

  return (
    <section className={styles.step} aria-label={title}>
      <StepHead step={step} title={title} />
      {mode !== "manual" ? (
        <SegmentedControl options={options} value={mode} onValueChange={(next) => go(next === "number" ? "number" : next === "arrivals" && leg === "first" ? "arrivals" : "route")} label={t("picker.howFind")} />
      ) : null}

      {mode === "arrivals" ? (
        <ArrivalFlights onPick={(departure) => onChange({ kind: "departure", departure, to: HUB })} onUnavailable={(message) => toManual(message)} onUseNumber={() => go("number")} onUseOther={() => go("route")} />
      ) : null}
      {mode === "route" ? (
        <RouteSearch leg={leg} after={after} onPick={(departure, from, to) => onChange({ kind: "departure", departure, from, to })} onUnavailable={(message) => toManual(message)} onUseNumber={() => go("number")} onUseOther={() => go("manual")} />
      ) : null}
      {mode === "number" ? (
        <NumberLookup initial={number} onFound={(flight) => onChange({ kind: "lookup", flight })} onUnavailable={toManual} />
      ) : null}
      {mode === "manual" ? (
        <div className={styles.stack}>
          <p className={styles.notice} role="status">{notice ? `${notice} ` : ""}{t("picker.addDetails")}</p>
          <ManualEntry leg={leg} initialNumber={number} onDone={(form) => onChange({ kind: "manual", form })} />
          <button type="button" className={styles.linkButton} onClick={() => go(home)}>{t("picker.backToSearch")}</button>
        </div>
      ) : (
        <button type="button" className={styles.linkButton} onClick={() => go("manual")}>{t("picker.enterByHand")}</button>
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
