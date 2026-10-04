"use client";

import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Select } from "@/components/arc/select/select";
import { StaffHeading } from "@/components/segue/staff-shell";
import { useToast } from "@/components/segue/toasts";
import { FormError, Mascot } from "@/components/segue/ui";
import { api, errorMessage, useResource, type Breaker, type DlqReplayBody, type Flight, type InjectEventBody } from "@/lib/api";
import { flightLabel, humanize } from "@/lib/format";
import { useSessionSeries } from "@/lib/hooks";
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

export function BreakerRow({ breaker, onChanged }: { breaker: Breaker; onChanged: () => void }) {
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
          <Badge size="sm" tone={breaker.state === "closed" ? "neutral" : "info"} icon={breaker.state === "closed" ? <Check width={12} height={12} aria-hidden="true" /> : <X width={12} height={12} aria-hidden="true" />}>
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

export function ReplayButton({ body, label, disabled, onReplayed }: { body: DlqReplayBody; label: string; disabled?: boolean; onReplayed: () => void }) {
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

type Console = ReturnType<typeof useConsoleData>;
const ConsoleContext = createContext<Console | null>(null);

/** Health, flights, dead letters and the audit log, polled once for every Control panel page. */
function useConsoleData() {
  const notify = useToast();
  const health = useResource(api.adminHealth, { pollMs: 5000 });
  const flights = useResource(api.adminFlights, { pollMs: 15_000 });
  const dlq = useResource(api.dlq, { pollMs: 15_000 });
  const audit = useResource(() => api.audit(100), { pollMs: 15_000 });
  const [target, setTarget] = useState<Flight | null>(null);

  const refreshAll = () => { void health.reload(); void flights.reload(); void dlq.reload(); void audit.reload(); };
  const services = Object.entries(health.data?.services ?? {});
  const down = services.filter(([, service]) => !service.ok).length;
  const healthData = health.data;
  const outbox = useSessionSeries(healthData, () => (healthData ? { pending: healthData.outbox_pending } : null));
  const queueBars = (dlq.data?.queues ?? []).map((queue) => ({ key: queue.name, label: queue.name, axisLabel: queue.name.replace(/.dlq$/, ""), value: queue.messages }));
  const waiting = queueBars.reduce((sum, bar) => sum + bar.value, 0);
  return { notify, health, flights, dlq, audit, target, setTarget, refreshAll, services, down, outbox, queueBars, waiting };
}

export function useConsole(): Console {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole is used inside ConsoleProvider");
  return value;
}

const HEADINGS: Record<string, { title: string; hint: string }> = {
  "/console": { title: "Control panel", hint: "Service health, breakers and the outbox at a glance." },
  "/console/flights": { title: "Tracked flights", hint: "Inject an event to simulate a delay, a gate change or a new status." },
  "/console/dead-letters": { title: "Dead letters", hint: "Events and messages that failed after retries." },
  "/console/audit": { title: "Audit log", hint: "The latest 100 actions." },
};

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const value = useConsoleData();
  const { notify, flights, audit, target, setTarget, refreshAll } = value;
  const heading = HEADINGS[usePathname()] ?? HEADINGS["/console"];
  return (
    <ConsoleContext.Provider value={value}>
      <StaffHeading
        title={heading.title}
        hint={heading.hint}
        aside={<div className={styles.headRow}><Mascot pose="code" size={48} /><Button variant="secondary" size="sm" onClick={refreshAll}>Refresh</Button></div>}
      />
      {children}

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
    </ConsoleContext.Provider>
  );
}
