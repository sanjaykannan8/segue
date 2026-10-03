"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import { Progress } from "@/components/arc/progress/progress";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Select } from "@/components/arc/select/select";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { StaffHeading } from "@/components/segue/staff-shell";
import { useToast } from "@/components/segue/toasts";
import { ErrorState, FormError, Mascot, Panel, PanelHeader, StaleNote } from "@/components/segue/ui";
import { api, errorMessage, useResource, type Breaker, type DlqReplayBody, type Flight, type InjectEventBody } from "@/lib/api";
import { flightLabel, flightStatusLabel, formatAge, formatDateTime, humanize } from "@/lib/format";
import styles from "../staff.module.css";

const BREAKER_MODES = [
  { value: "auto", label: "Auto" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];
const BREAKER_STATE: Record<Breaker["state"], string> = { closed: "Closed, calls pass", open: "Open, calls skipped", half_open: "Half-open, testing" };
const STATUS_OPTIONS = [
  { value: "keep", label: "No change" },
  { value: "scheduled", label: "Scheduled" },
  { value: "en-route", label: "En route" },
  { value: "landed", label: "Landed" },
  { value: "cancelled", label: "Cancelled" },
];

function BreakerRow({ breaker, onChanged }: { breaker: Breaker; onChanged: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const mode = breaker.forced === "open" || breaker.forced === "closed" ? breaker.forced : "auto";

  async function change(next: string) {
    if (busy || next === mode || (next !== "auto" && next !== "open" && next !== "closed")) return;
    setBusy(true);
    try {
      await api.setBreaker(breaker.name, next);
      notify(`${humanize(breaker.name)} breaker set to ${next}`);
      onChanged();
    } catch (error) {
      notify("Breaker not changed", errorMessage(error));
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.breaker}>
      <div>
        <p className={styles.breakerName}>
          {humanize(breaker.name)}
          <Badge size="sm" tone={breaker.state === "closed" ? "neutral" : "danger"} icon={breaker.state === "closed" ? <Check width={12} height={12} aria-hidden="true" /> : <X width={12} height={12} aria-hidden="true" />}>
            {BREAKER_STATE[breaker.state] ?? humanize(breaker.state)}
          </Badge>
        </p>
        <p className={styles.muted}>{breaker.failures} {breaker.failures === 1 ? "failure" : "failures"} counted{breaker.forced ? `, forced ${breaker.forced}` : ""}</p>
      </div>
      <SegmentedControl options={BREAKER_MODES} value={mode} onValueChange={(next) => void change(next)} label={`${humanize(breaker.name)} breaker mode`} />
    </div>
  );
}

function InjectDialog({ flight, onClose, onInjected }: { flight: Flight | null; onClose: () => void; onInjected: (next: Flight) => void }) {
  return (
    <Dialog open={flight !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title={flight ? `Inject event for ${flightLabel(flight.flight_iata)}` : "Inject event"} description="Leave a field empty to keep its current value.">
        {flight ? <InjectForm key={flight.id} flight={flight} onInjected={onInjected} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function InjectForm({ flight, onInjected }: { flight: Flight; onInjected: (next: Flight) => void }) {
  const [delay, setDelay] = useState("");
  const [fields, setFields] = useState({ dep_gate: "", arr_gate: "", dep_terminal: "", arr_terminal: "" });
  const [status, setStatus] = useState("keep");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => setFields((now) => ({ ...now, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: InjectEventBody = { flight_id: flight.id };
    if (delay.trim() !== "") {
      const minutes = Number(delay);
      if (!Number.isFinite(minutes)) { setError(new Error("Delay must be a number of minutes.")); return; }
      body.delay_min = Math.round(minutes);
    }
    for (const key of ["dep_gate", "arr_gate", "dep_terminal", "arr_terminal"] as const) if (fields[key].trim()) body[key] = fields[key].trim();
    if (status !== "keep") body.status = status;
    if (Object.keys(body).length === 1) { setError(new Error("Change at least one field.")); return; }
    setBusy(true);
    setError(null);
    try { onInjected(await api.injectEvent(body)); } catch (caught) { setError(caught); setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className={styles.formGrid}>
        <Input label="Delay (minutes)" type="number" inputMode="numeric" value={delay} onChange={(event) => setDelay(event.target.value)} description={`Now ${flight.delay_min} min`} />
        <Select label="Status" value={status} onValueChange={setStatus} options={STATUS_OPTIONS} description={`Now ${humanize(flight.status)}`} />
        <Input label="Departure gate" value={fields.dep_gate} onChange={set("dep_gate")} description={`Now ${flight.dep_gate ?? "not set"}`} />
        <Input label="Arrival gate" value={fields.arr_gate} onChange={set("arr_gate")} description={`Now ${flight.arr_gate ?? "not set"}`} />
        <Input label="Departure terminal" value={fields.dep_terminal} onChange={set("dep_terminal")} description={`Now ${flight.dep_terminal ?? "not set"}`} />
        <Input label="Arrival terminal" value={fields.arr_terminal} onChange={set("arr_terminal")} description={`Now ${flight.arr_terminal ?? "not set"}`} />
      </div>
      <div style={{ marginTop: "var(--space-4)" }}><FormError error={error} /></div>
      <div className={styles.formActions}>
        <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
        <Button type="submit" loading={busy}>Inject event</Button>
      </div>
    </form>
  );
}

function ReplayButton({ body, label, disabled, onReplayed }: { body: DlqReplayBody; label: string; disabled?: boolean; onReplayed: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  async function replay() {
    setBusy(true);
    try {
      const { replayed } = await api.replayDlq(body);
      notify(`Replayed ${replayed} ${replayed === 1 ? "message" : "messages"}`);
      onReplayed();
    } catch (error) {
      notify("Replay failed", errorMessage(error));
    } finally { setBusy(false); }
  }
  return <Button size="sm" variant="secondary" onClick={() => void replay()} loading={busy} disabled={disabled} aria-label={label}>Replay</Button>;
}

export default function ConsolePage() {
  const notify = useToast();
  const health = useResource(api.adminHealth, { pollMs: 5000 });
  const flights = useResource(api.adminFlights, { pollMs: 15_000 });
  const dlq = useResource(api.dlq, { pollMs: 15_000 });
  const audit = useResource(() => api.audit(100), { pollMs: 15_000 });
  const [target, setTarget] = useState<Flight | null>(null);

  const refreshAll = () => { void health.reload(); void flights.reload(); void dlq.reload(); void audit.reload(); };
  const services = Object.entries(health.data?.services ?? {});
  const down = services.filter(([, service]) => !service.ok).length;

  return (
    <>
      <StaffHeading
        title="Control panel"
        hint="Service health, breakers, test events and dead letters."
        aside={<div className={styles.headRow}><Mascot pose="code" size={48} /><Button variant="secondary" size="sm" onClick={refreshAll}>Refresh</Button></div>}
      />

      {health.data ? <StaleNote error={health.error} onRetry={() => void health.reload()} /> : null}
      {health.loading ? <Panel><Skeleton label="Loading service health" lines={5} /></Panel> : null}
      {!health.loading && !health.data ? <ErrorState error={health.error} onRetry={() => void health.reload()} title="Service health didn't load" /> : null}

      {health.data ? (
        <>
          <Panel label="Service health">
            <PanelHeader title="Service health" hint={services.length === 0 ? "No services reported." : down === 0 ? "All services are up. Checked every 5 seconds." : `${down} of ${services.length} down. Checked every 5 seconds.`} />
            <div className={styles.tiles}>
              {services.map(([name, service]) => (
                <div key={name} className={styles.tile}>
                  <div className={styles.tileTop}>
                    <span className={styles.tileName}>{humanize(name)}</span>
                    <Badge size="sm" tone={service.ok ? "info" : "danger"} icon={service.ok ? <Check width={12} height={12} aria-hidden="true" /> : <X width={12} height={12} aria-hidden="true" />}>{service.ok ? "OK" : "Down"}</Badge>
                  </div>
                  <p className={styles.tileDetail}>{service.detail || (service.ok ? "Responding" : "No detail given")}</p>
                </div>
              ))}
            </div>
          </Panel>

          <div className={styles.consoleGrid}>
            <Panel label="Circuit breakers">
              <PanelHeader title="Breakers" hint="Auto lets each breaker open and close itself." />
              {health.data.breakers.length
                ? health.data.breakers.map((breaker) => <BreakerRow key={breaker.name} breaker={breaker} onChanged={() => void health.reload()} />)
                : <p className={styles.muted}>No breakers reported.</p>}
            </Panel>

            <div className={styles.stack}>
              <Panel label="AirLabs budget">
                <PanelHeader title="AirLabs budget" hint="Flight status calls used." />
                <div className={styles.statRow}>
                  <span className={styles.bigNumber}>{health.data.airlabs.used}</span>
                  <span className={styles.muted}>of {health.data.airlabs.budget} calls</span>
                </div>
                <Progress value={health.data.airlabs.used} max={health.data.airlabs.budget || 1} label="Budget used" showValue />
              </Panel>
              <Panel label="Outbox">
                <PanelHeader title="Outbox" hint="Decisions saved but not yet published." />
                <div className={styles.statRow} style={{ marginBottom: 0 }}>
                  <span className={styles.bigNumber}>{health.data.outbox_pending}</span>
                  <span className={styles.muted}>pending</span>
                </div>
              </Panel>
            </div>
          </div>
        </>
      ) : null}

      <Panel label="Tracked flights">
        <PanelHeader title="Tracked flights" hint="Inject an event to simulate a delay, a gate change or a new status." />
        {flights.data ? <StaleNote error={flights.error} onRetry={() => void flights.reload()} /> : null}
        {flights.loading ? <Skeleton label="Loading tracked flights" lines={4} /> : null}
        {!flights.loading && !flights.data ? <ErrorState compact error={flights.error} onRetry={() => void flights.reload()} title="Flights didn't load" /> : null}
        {flights.data && flights.data.length === 0 ? <EmptyState icon={<Mascot pose="sleepy" size={40} />} title="No flights tracked yet" description="Flights appear here once a passenger adds a trip." label="No tracked flights" /> : null}
        {flights.data && flights.data.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Tracked flights</caption>
              <thead>
                <tr>
                  <th scope="col">Flight</th>
                  <th scope="col">Date</th>
                  <th scope="col">Route</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dep. gate</th>
                  <th scope="col">Arr. gate</th>
                  <th scope="col" className={styles.right}>Version</th>
                  <th scope="col">Source</th>
                  <th scope="col">Updated</th>
                  <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {flights.data.map((flight) => (
                  <tr key={flight.id}>
                    <td className={`${styles.strong} ${styles.nowrap}`}>{flightLabel(flight.flight_iata)}</td>
                    <td className={`${styles.num} ${styles.nowrap}`}>{flight.date}</td>
                    <td><span className={styles.route}>{flight.origin} <ArrowRight width={14} height={14} aria-label="to" /> {flight.dest}</span></td>
                    <td>{flightStatusLabel(flight)}</td>
                    <td>{[flight.dep_terminal ? `T${flight.dep_terminal.replace(/^T/i, "")}` : null, flight.dep_gate].filter(Boolean).join(" · ") || "Not set"}</td>
                    <td>{[flight.arr_terminal ? `T${flight.arr_terminal.replace(/^T/i, "")}` : null, flight.arr_gate].filter(Boolean).join(" · ") || "Not set"}</td>
                    <td className={`${styles.right} ${styles.num}`}>{flight.version}</td>
                    <td>{flight.source === "airlabs" ? "AirLabs" : "Manual"}</td>
                    <td className={styles.nowrap}>{formatAge(flight.age_sec)}</td>
                    <td className={styles.right}><Button size="sm" variant="secondary" onClick={() => setTarget(flight)} aria-label={`Inject event for ${flightLabel(flight.flight_iata)}`}>Inject event</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <Panel label="Dead letters">
        <PanelHeader title="Dead letters" hint={health.data ? `${health.data.dead_events} dead ${health.data.dead_events === 1 ? "event" : "events"} in total.` : "Events and messages that failed after retries."} />
        {dlq.data ? <StaleNote error={dlq.error} onRetry={() => void dlq.reload()} /> : null}
        {dlq.loading ? <Skeleton label="Loading dead letters" lines={4} /> : null}
        {!dlq.loading && !dlq.data ? <ErrorState compact error={dlq.error} onRetry={() => void dlq.reload()} title="Dead letters didn't load" /> : null}
        {dlq.data ? (
          <>
            <h3 className={styles.sub} style={{ marginTop: 0 }}>Dead events</h3>
            {dlq.data.events.length === 0 ? <p className={styles.muted}>No dead events.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className="sr-only">Dead events</caption>
                  <thead>
                    <tr>
                      <th scope="col">Topic</th>
                      <th scope="col">Error</th>
                      <th scope="col">Payload</th>
                      <th scope="col">When</th>
                      <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dlq.data.events.map((event) => (
                      <tr key={event.id}>
                        <td className={styles.mono}>{event.topic}</td>
                        <td>{event.error}</td>
                        <td><pre className={`${styles.mono} ${styles.payload}`} tabIndex={0}>{typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload, null, 1)}</pre></td>
                        <td className={styles.nowrap}>{formatDateTime(event.created_at)}</td>
                        <td className={styles.right}><ReplayButton body={{ kind: "event", id: event.id }} label={`Replay event on ${event.topic}`} onReplayed={refreshAll} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className={styles.sub}>Dead-letter queues</h3>
            {dlq.data.queues.length === 0 ? <p className={styles.muted}>No queues reported.</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className="sr-only">Dead-letter queues</caption>
                  <thead>
                    <tr>
                      <th scope="col">Queue</th>
                      <th scope="col" className={styles.right}>Messages</th>
                      <th scope="col" className={styles.right}><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dlq.data.queues.map((queue) => (
                      <tr key={queue.name}>
                        <td className={styles.mono}>{queue.name}</td>
                        <td className={`${styles.right} ${styles.num}`}>{queue.messages}</td>
                        <td className={styles.right}><ReplayButton body={{ kind: "queue", name: queue.name }} label={`Replay queue ${queue.name}`} disabled={queue.messages === 0} onReplayed={refreshAll} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </Panel>

      <Panel label="Audit log">
        <PanelHeader title="Audit log" hint="The latest 100 actions." />
        {audit.data ? <StaleNote error={audit.error} onRetry={() => void audit.reload()} /> : null}
        {audit.loading ? <Skeleton label="Loading the audit log" lines={4} /> : null}
        {!audit.loading && !audit.data ? <ErrorState compact error={audit.error} onRetry={() => void audit.reload()} title="The audit log didn't load" /> : null}
        {audit.data && audit.data.length === 0 ? <p className={styles.muted}>Nothing logged yet.</p> : null}
        {audit.data && audit.data.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Recent audit log</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Role</th>
                  <th scope="col">Action</th>
                  <th scope="col">Object</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((entry, index) => (
                  <tr key={`${entry.at}-${index}`}>
                    <td className={`${styles.num} ${styles.nowrap}`}>{formatDateTime(entry.at)}</td>
                    <td>{entry.actor}</td>
                    <td>{humanize(entry.role)}</td>
                    <td>{humanize(entry.action)}</td>
                    <td className={styles.mono}>{entry.object}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      <InjectDialog
        flight={target}
        onClose={() => setTarget(null)}
        onInjected={(next) => {
          flights.setData((current) => current?.map((flight) => (flight.id === next.id ? next : flight)));
          setTarget(null);
          notify("Event injected", `${flightLabel(next.flight_iata)} is now version ${next.version}.`);
          void audit.reload();
        }}
      />
    </>
  );
}
